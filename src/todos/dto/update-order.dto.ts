import { IsNumber, Min } from 'class-validator';

export class UpdateOrderDto {
  @IsNumber()
  @Min(0)
  order: number;
}
