import { IsDateString, IsEnum, IsHexColor, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { TodoWriteStatusDto } from './todo-status.dto';

export class UpdateTodoDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TodoWriteStatusDto)
  status?: TodoWriteStatusDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsDateString()
  dueDateTime?: string;

  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
