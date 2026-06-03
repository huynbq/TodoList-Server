import { Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async listUnread(@Req() request: Request) {
    return { data: await this.notificationsService.listUnread(this.getUserId(request)) };
  }

  @Patch(':id/read')
  async markRead(@Req() request: Request, @Param('id') id: string) {
    return { data: await this.notificationsService.markRead(this.getUserId(request), id) };
  }

  private getUserId(request: Request) {
    return (request as AuthenticatedRequest).user.id;
  }
}
