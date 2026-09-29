import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class JoinGroupDto {
  @ApiPropertyOptional({ description: 'Grupo de la misma plataforma cuyo lugar sin pagar se suelta al entrar a este ("cambiarme a este").' })
  @IsOptional()
  @IsUUID('4')
  switchFromGroupId?: string;
}
