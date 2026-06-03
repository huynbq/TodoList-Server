import { IsOptional, IsUUID } from 'class-validator';

export class ReorderTodoDto {
  @IsOptional()
  @IsUUID()
  previousId?: string | null;

  @IsOptional()
  @IsUUID()
  nextId?: string | null;
}
