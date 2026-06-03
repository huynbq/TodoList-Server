import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Todo, TodoStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { ListTodosDto } from './dto/list-todos.dto';
import { ReorderTodoDto } from './dto/reorder-todo.dto';
import { TodoStatusDto, TodoWriteStatusDto } from './dto/todo-status.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';

const ORDER_STEP = 1000;
const MIN_ORDER_GAP = 0.000001;
const LOCAL_REINDEX_SIZE = 100;

type TodoCursor = {
  order: number;
  id: string;
};

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListTodosDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    const where = this.buildWhere(userId, query);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const shouldCount = !cursor && !query.search && query.status === TodoStatusDto.all;

    const cursorWhere: Prisma.TodoWhereInput | undefined = cursor
      ? {
          OR: [
            { order: { gt: cursor.order } },
            { order: cursor.order, id: { gt: cursor.id } },
          ],
        }
      : undefined;

    const todos = await this.prisma.todo.findMany({
      where: cursorWhere ? { AND: [where, cursorWhere] } : where,
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      skip: cursor ? 0 : offset,
    });
    const total = shouldCount ? await this.prisma.todo.count({ where }) : null;

    const data = todos.slice(0, limit).map((todo) => this.serialize(todo));
    const last = todos.length > limit ? data[data.length - 1] : null;

    return {
      data,
      total,
      offset,
      limit,
      nextOffset: cursor ? null : total === null || offset + data.length < total ? offset + data.length : null,
      nextCursor: last ? this.encodeCursor({ order: last.order, id: last.id }) : null,
      hasMore: todos.length > limit,
    };
  }

  async create(userId: string, dto: CreateTodoDto) {
    const todo = await this.prisma.$transaction(async (tx) => {
      const order = dto.order ?? (await this.nextTopOrder(tx, userId));

      return tx.todo.create({
        data: {
          userId,
          title: dto.title,
          description: dto.description,
          status: this.toPrismaStatus(dto.status),
          order,
          dueDateTime: new Date(dto.dueDateTime),
          startDateTime: new Date(dto.startDateTime),
          reminderDateTime: dto.reminderDateTime ? new Date(dto.reminderDateTime) : null,
          reminderSent: false,
          reminderSentAt: null,
          color: dto.color,
        },
      });
    });

    return this.serialize(todo);
  }

  async update(userId: string, id: string, dto: UpdateTodoDto) {
    await this.ensureExists(userId, id);

    const reminderDateTimeChanged = dto.reminderDateTime !== undefined;
    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status ? this.toPrismaStatus(dto.status) : undefined,
        order: dto.order,
        dueDateTime: dto.dueDateTime ? new Date(dto.dueDateTime) : undefined,
        startDateTime: dto.startDateTime ? new Date(dto.startDateTime) : undefined,
        reminderDateTime: reminderDateTimeChanged
          ? dto.reminderDateTime
            ? new Date(dto.reminderDateTime)
            : null
          : undefined,
        reminderSent: reminderDateTimeChanged ? false : dto.reminderSent,
        reminderSentAt: reminderDateTimeChanged ? null : dto.reminderSentAt ? new Date(dto.reminderSentAt) : undefined,
        color: dto.color,
      },
    });

    return this.serialize(todo);
  }

  async toggleStatus(userId: string, id: string) {
    const current = await this.ensureExists(userId, id);
    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        status: current.status === TodoStatus.completed ? TodoStatus.pending : TodoStatus.completed,
      },
    });

    return this.serialize(todo);
  }

  async updateOrder(userId: string, id: string, order: number) {
    await this.ensureExists(userId, id);

    const todo = await this.prisma.todo.update({
      where: { id },
      data: { order },
    });

    return this.serialize(todo);
  }

  async reorder(userId: string, id: string, dto: ReorderTodoDto) {
    this.validateId(id);

    if (dto.previousId) {
      this.validateId(dto.previousId);
    }

    if (dto.nextId) {
      this.validateId(dto.nextId);
    }

    if (dto.previousId === id || dto.nextId === id) {
      throw new BadRequestException('A todo cannot be reordered next to itself');
    }

    if (dto.previousId && dto.previousId === dto.nextId) {
      throw new BadRequestException('previousId and nextId must be different');
    }

    const todo = await this.prisma.$transaction(async (tx) => {
      const movedTodo = await tx.todo.findFirst({ where: { id, userId } });

      if (!movedTodo) {
        throw new NotFoundException('Todo not found');
      }

      let previousTodo = dto.previousId ? await tx.todo.findFirst({ where: { id: dto.previousId, userId } }) : null;
      let nextTodo = dto.nextId ? await tx.todo.findFirst({ where: { id: dto.nextId, userId } }) : null;

      if (dto.previousId && !previousTodo) {
        throw new BadRequestException('previousId todo not found');
      }

      if (dto.nextId && !nextTodo) {
        throw new BadRequestException('nextId todo not found');
      }

      if (this.shouldReindex(previousTodo?.order ?? null, nextTodo?.order ?? null)) {
        await this.reindexLocalWindow(tx, userId, id, previousTodo?.order ?? null);
        previousTodo = dto.previousId ? await tx.todo.findFirst({ where: { id: dto.previousId, userId } }) : null;
        nextTodo = dto.nextId ? await tx.todo.findFirst({ where: { id: dto.nextId, userId } }) : null;
      }

      const order = this.calculateOrder(previousTodo?.order ?? null, nextTodo?.order ?? null);

      return tx.todo.update({
        where: { id },
        data: { order },
      });
    });

    return this.serialize(todo);
  }

  async remove(userId: string, id: string) {
    await this.ensureExists(userId, id);
    await this.prisma.todo.delete({ where: { id } });
  }

  private buildWhere(userId: string, query: ListTodosDto): Prisma.TodoWhereInput {
    const filters: Prisma.TodoWhereInput[] = [{ userId }];

    if (query.status !== TodoStatusDto.all) {
      filters.push({ status: this.toPrismaStatus(query.status) });
    }

    if (query.search) {
      filters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return filters.length ? { AND: filters } : {};
  }

  private async ensureExists(userId: string, id: string) {
    this.validateId(id);

    const todo = await this.prisma.todo.findFirst({ where: { id, userId } });

    if (!todo) {
      throw new NotFoundException('Todo not found');
    }

    return todo;
  }

  private async nextTopOrder(tx: Prisma.TransactionClient, userId: string) {
    const firstTodo = await tx.todo.findFirst({
      where: { userId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { order: true },
    });

    if (!firstTodo) {
      return ORDER_STEP;
    }

    if (firstTodo.order <= MIN_ORDER_GAP) {
      await this.reindexLocalWindow(tx, userId, '00000000-0000-0000-0000-000000000000', null);
      return ORDER_STEP / 2;
    }

    return firstTodo.order / 2;
  }

  private calculateOrder(previousOrder: number | null, nextOrder: number | null) {
    if (previousOrder === null && nextOrder === null) {
      return ORDER_STEP;
    }

    if (previousOrder === null) {
      return nextOrder! / 2;
    }

    if (nextOrder === null) {
      return previousOrder + ORDER_STEP;
    }

    return (previousOrder + nextOrder) / 2;
  }

  private shouldReindex(previousOrder: number | null, nextOrder: number | null) {
    if (nextOrder === null) {
      return false;
    }

    if (previousOrder === null) {
      return nextOrder <= MIN_ORDER_GAP;
    }

    return nextOrder - previousOrder <= MIN_ORDER_GAP;
  }

  private async reindexLocalWindow(tx: Prisma.TransactionClient, userId: string, movedTodoId: string, previousOrder: number | null) {
    const baseOrder = previousOrder ?? 0;

    await tx.$executeRaw`
      WITH local_todos AS (
        SELECT
          id,
          ${baseOrder}::double precision + row_number() OVER (ORDER BY "order" ASC, id ASC) * ${ORDER_STEP} AS next_order
        FROM (
          SELECT id, "order"
          FROM todos
          WHERE id <> ${movedTodoId}::uuid
            AND user_id = ${userId}::uuid
            AND "order" > ${baseOrder}::double precision
          ORDER BY "order" ASC, id ASC
          LIMIT ${LOCAL_REINDEX_SIZE}
        ) windowed_todos
      )
      UPDATE todos
      SET "order" = local_todos.next_order
      FROM local_todos
      WHERE todos.id = local_todos.id
    `;
  }

  private toPrismaStatus(status: TodoStatusDto.pending | TodoStatusDto.completed | TodoWriteStatusDto): TodoStatus {
    return status === TodoStatusDto.completed ? TodoStatus.completed : TodoStatus.pending;
  }

  private serialize(todo: Todo) {
    return {
      id: todo.id,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      order: todo.order,
      dueDateTime: todo.dueDateTime.toISOString(),
      startDateTime: todo.startDateTime.toISOString(),
      reminderDateTime: todo.reminderDateTime?.toISOString() ?? null,
      reminderSent: todo.reminderSent,
      reminderSentAt: todo.reminderSentAt?.toISOString() ?? null,
      color: todo.color,
    };
  }

  private encodeCursor(cursor: TodoCursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): TodoCursor {
    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as TodoCursor;

      if (typeof decoded.order !== 'number' || typeof decoded.id !== 'string') {
        throw new Error('Invalid cursor');
      }

      return decoded;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private validateId(id: string) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuid.test(id)) {
      throw new BadRequestException('Invalid todo id');
    }
  }
}
