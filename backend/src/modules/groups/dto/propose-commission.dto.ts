import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class ProposeCommissionDto {
  @ApiProperty({ example: 12, minimum: 10, maximum: 15, description: '% de comisión de Partly para este grupo (rango permitido: 10% a 15%).' })
  @IsNumber()
  @Min(10)
  @Max(15)
  commissionPercentage: number;
}
