import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TodoStatusDto } from './todo-status.dto';

export class ListTodosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  search = '';

  @IsOptional()
  @IsEnum(TodoStatusDto)
  status: TodoStatusDto = TodoStatusDto.all;

  @IsOptional()
  @IsString()
  cursor?: string;
}
