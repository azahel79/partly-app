import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';

export class UpdateProviderListingDto {
  @ApiPropertyOptional({ example: 45.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  wholesalePrice?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Desactívalo si ya no quieres que se muestre a los vendedores' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Solo afecta a las compras nuevas; las que ya se hicieron conservan sus condiciones.' })
  @IsOptional()
  @IsBoolean()
  renewable?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(400)
  validityDays?: number;
}
