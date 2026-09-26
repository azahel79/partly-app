import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewCommissionDto {
  @ApiProperty({ description: 'true = la transferencia llegó a la cuenta de Vakeva. false = se rechaza el comprobante.' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ example: 'El monto de la transferencia no coincide.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
