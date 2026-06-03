import { IsDateString, IsEnum, IsHexColor, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TodoWriteStatusDto } from './todo-status.dto';

export class CreateTodoDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(TodoWriteStatusDto)
  status: TodoWriteStatusDto = TodoWriteStatusDto.pending;

  @IsOptional()
  @IsNumber()
  @Min(0)
  order?: number;

  @IsDateString()
  dueDateTime: string;

  @IsDateString()
  startDateTime: string;

  @IsOptional()
  @IsDateString()
  reminderDateTime?: string | null;

  @IsOptional()
  @IsHexColor()
  color = '#3b82f6';
}
