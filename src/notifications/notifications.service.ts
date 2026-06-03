import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReminderNotification } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NotificationsService {
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
    const dueTodos = await this.prisma.todo.findMany({
      where: {
        userId: { not: null },
        status: 'pending',
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
  }

  private serialize(notification: ReminderNotification) {
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
