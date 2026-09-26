import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WholesaleAccessStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReviewWholesaleAccessDto {
  @ApiProperty({ enum: WholesaleAccessStatus, description: 'AUTHORIZED, REJECTED o REVOKED.' })
  @IsEnum(WholesaleAccessStatus)
  status: WholesaleAccessStatus;

  @ApiPropertyOptional({ example: 2, description: 'Cuentas nuevas por mes que puede comprar. Sin valor = sin tope. Solo aplica al autorizar.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  monthlyCap?: number;

  @ApiPropertyOptional({ example: 'Aún no tienes reseñas suficientes.', description: 'Motivo (obligatorio al rechazar).' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
