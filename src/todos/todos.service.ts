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

  async list(query: ListTodosDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    const offset = query.offset ?? 0;
    const where = this.buildWhere(query);
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

  async create(dto: CreateTodoDto) {
    const order = dto.order ?? (await this.nextOrder());
    const todo = await this.prisma.todo.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: this.toPrismaStatus(dto.status),
        order,
        dueDateTime: new Date(dto.dueDateTime),
        startDateTime: new Date(dto.startDateTime),
        color: dto.color,
      },
    });

    return this.serialize(todo);
  }

  async update(id: string, dto: UpdateTodoDto) {
    await this.ensureExists(id);

    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status ? this.toPrismaStatus(dto.status) : undefined,
        order: dto.order,
        dueDateTime: dto.dueDateTime ? new Date(dto.dueDateTime) : undefined,
        startDateTime: dto.startDateTime ? new Date(dto.startDateTime) : undefined,
        color: dto.color,
      },
    });

    return this.serialize(todo);
  }

  async toggleStatus(id: string) {
    const current = await this.ensureExists(id);
    const todo = await this.prisma.todo.update({
      where: { id },
      data: {
        status: current.status === TodoStatus.completed ? TodoStatus.pending : TodoStatus.completed,
      },
    });

    return this.serialize(todo);
  }

  async updateOrder(id: string, order: number) {
    await this.ensureExists(id);

    const todo = await this.prisma.todo.update({
      where: { id },
      data: { order },
    });

    return this.serialize(todo);
  }

  async reorder(id: string, dto: ReorderTodoDto) {
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
      const movedTodo = await tx.todo.findUnique({ where: { id } });

      if (!movedTodo) {
        throw new NotFoundException('Todo not found');
      }

      let previousTodo = dto.previousId ? await tx.todo.findUnique({ where: { id: dto.previousId } }) : null;
      let nextTodo = dto.nextId ? await tx.todo.findUnique({ where: { id: dto.nextId } }) : null;

      if (dto.previousId && !previousTodo) {
        throw new BadRequestException('previousId todo not found');
      }

      if (dto.nextId && !nextTodo) {
        throw new BadRequestException('nextId todo not found');
      }

      if (this.shouldReindex(previousTodo?.order ?? null, nextTodo?.order ?? null)) {
        await this.reindexLocalWindow(tx, id, previousTodo?.order ?? null);
        previousTodo = dto.previousId ? await tx.todo.findUnique({ where: { id: dto.previousId } }) : null;
        nextTodo = dto.nextId ? await tx.todo.findUnique({ where: { id: dto.nextId } }) : null;
      }

      const order = this.calculateOrder(previousTodo?.order ?? null, nextTodo?.order ?? null);

      return tx.todo.update({
        where: { id },
        data: { order },
      });
    });

    return this.serialize(todo);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.todo.delete({ where: { id } });
  }

  private buildWhere(query: ListTodosDto): Prisma.TodoWhereInput {
    const filters: Prisma.TodoWhereInput[] = [];

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

  private async ensureExists(id: string) {
    this.validateId(id);

    const todo = await this.prisma.todo.findUnique({ where: { id } });

    if (!todo) {
      throw new NotFoundException('Todo not found');
    }

    return todo;
  }

  private async nextOrder() {
    const aggregate = await this.prisma.todo.aggregate({ _max: { order: true } });

    return (aggregate._max.order ?? 0) + ORDER_STEP;
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

  private async reindexLocalWindow(tx: Prisma.TransactionClient, movedTodoId: string, previousOrder: number | null) {
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
