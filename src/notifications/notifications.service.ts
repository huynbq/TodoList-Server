import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TodoStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type ReminderNotificationRecord = {
  id: string;
  userId: string;
  todoId: string;
  title: string;
  message: string | null;
  readAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private isCreatingDueReminders = false;

  constructor(private readonly prisma: PrismaService) {}

  async listUnread(userId: string) {
    const notifications = await this.prisma.reminderNotification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return notifications.map((notification) => this.serialize(notification));
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.reminderNotification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.reminderNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return this.serialize(updated);
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async createDueReminderNotifications() {
    if (this.isCreatingDueReminders) {
      return;
    }

    this.isCreatingDueReminders = true;

    try {
      await this.prisma.todo.updateMany({
        where: {
          status: TodoStatus.pending,
          dueDateTime: { lte: new Date() },
        },
        data: { status: TodoStatus.overdue },
      });

      const dueTodos = await this.prisma.todo.findMany({
        where: {
          userId: { not: null },
          status: { in: [TodoStatus.pending, TodoStatus.overdue] },
          reminderSent: false,
          reminderDateTime: { lte: new Date() },
        },
        orderBy: [{ reminderDateTime: 'asc' }, { order: 'asc' }, { id: 'asc' }],
        take: 100,
      });

      if (!dueTodos.length) {
        return;
      }

      await this.prisma.$transaction([
        this.prisma.reminderNotification.createMany({
          data: dueTodos.map((todo) => ({
            userId: todo.userId!,
            todoId: todo.id,
            title: todo.title,
            message: todo.description,
          })),
        }),
        this.prisma.todo.updateMany({
          where: { id: { in: dueTodos.map((todo) => todo.id) } },
          data: { reminderSent: true, reminderSentAt: new Date() },
        }),
      ]);
    } catch (error) {
      this.logger.warn(
        `Skipped due reminder check because the database was unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.isCreatingDueReminders = false;
    }
  }

  private serialize(notification: ReminderNotificationRecord) {
    return {
      id: notification.id,
      userId: notification.userId,
      todoId: notification.todoId,
      title: notification.title,
      message: notification.message,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
