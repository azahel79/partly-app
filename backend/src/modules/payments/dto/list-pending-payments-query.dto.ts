import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListPendingPaymentsQueryDto {
  @ApiPropertyOptional({ default: false, description: 'Si true, solo muestra los que ya tienen comprobante subido.' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? false : value === 'true' || value === true))
  @IsBoolean()
  onlyWithReceipt: boolean = false;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
