import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CreateTodoDto } from './dto/create-todo.dto';
import { ListTodosDto } from './dto/list-todos.dto';
import { ReorderTodoDto } from './dto/reorder-todo.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodosService } from './todos.service';

@Controller('todos')
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  list(@Query() query: ListTodosDto) {
    return this.todosService.list(query);
  }

  @Post()
  async create(@Body() dto: CreateTodoDto) {
    return { data: await this.todosService.create(dto) };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTodoDto) {
    return { data: await this.todosService.update(id, dto) };
  }

  @Patch(':id/toggle-status')
  async toggleStatus(@Param('id') id: string) {
    return { data: await this.todosService.toggleStatus(id) };
  }

  @Patch(':id/order')
  async updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return { data: await this.todosService.updateOrder(id, dto.order) };
  }

  @Patch(':id/reorder')
  async reorder(@Param('id') id: string, @Body() dto: ReorderTodoDto) {
    return { data: await this.todosService.reorder(id, dto) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.todosService.remove(id);
  }
}
