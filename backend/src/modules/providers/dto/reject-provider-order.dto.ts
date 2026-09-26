import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectProviderOrderDto {
  @ApiPropertyOptional({ example: 'Ya no tengo esa cuenta disponible.', description: 'El comprador lo ve tal cual.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
