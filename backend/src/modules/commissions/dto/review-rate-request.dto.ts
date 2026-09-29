import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewRateRequestDto {
  @ApiProperty({ description: 'true = se autoriza la comisión reducida. false = se rechaza (con motivo).' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ example: 7, description: 'Porcentaje nuevo (obligatorio al aprobar): menor al actual y de al menos 6%.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  rate?: number;

  @ApiPropertyOptional({ example: 'Aún tienes pocas reseñas; vuelve a pedirla cuando tengas más.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
