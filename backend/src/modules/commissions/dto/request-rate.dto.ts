import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestRateDto {
  @ApiPropertyOptional({ example: 'Llevo 6 meses con mis grupos llenos y sin incidencias.', description: 'Mensaje opcional para el admin.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}
