import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CreateTodoDto } from './dto/create-todo.dto';
import { ListTodosDto } from './dto/list-todos.dto';
import { ReorderTodoDto } from './dto/reorder-todo.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodosService } from './todos.service';

@Controller('todos')
@UseGuards(AuthGuard)
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  list(@Req() request: Request, @Query() query: ListTodosDto) {
    return this.todosService.list(this.getUserId(request), query);
  }

  @Post()
  async create(@Req() request: Request, @Body() dto: CreateTodoDto) {
    return { data: await this.todosService.create(this.getUserId(request), dto) };
  }

  @Put(':id')
  async update(@Req() request: Request, @Param('id') id: string, @Body() dto: UpdateTodoDto) {
    return { data: await this.todosService.update(this.getUserId(request), id, dto) };
  }

  @Patch(':id/toggle-status')
  async toggleStatus(@Req() request: Request, @Param('id') id: string) {
    return { data: await this.todosService.toggleStatus(this.getUserId(request), id) };
  }

  @Patch(':id/order')
  async updateOrder(@Req() request: Request, @Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return { data: await this.todosService.updateOrder(this.getUserId(request), id, dto.order) };
  }

  @Patch(':id/reorder')
  async reorder(@Req() request: Request, @Param('id') id: string, @Body() dto: ReorderTodoDto) {
    return { data: await this.todosService.reorder(this.getUserId(request), id, dto) };
  }

  @Delete(':id')
  async remove(@Req() request: Request, @Param('id') id: string) {
    await this.todosService.remove(this.getUserId(request), id);
  }

  private getUserId(request: Request) {
    return (request as AuthenticatedRequest).user.id;
  }
}
