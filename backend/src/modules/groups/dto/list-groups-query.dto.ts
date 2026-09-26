import { ApiPropertyOptional } from '@nestjs/swagger';
import { GroupStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsIn, IsOptional, IsUUID, Max, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class ListGroupsQueryDto {
  @ApiPropertyOptional({ description: 'Filtra por plan' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4')
  planId?: string;

  @ApiPropertyOptional({ description: 'Filtra por servicio (Netflix, Spotify...)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4')
  platformId?: string;

  @ApiPropertyOptional({ description: 'Filtra por categoría' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filtra por vendedor (owner) — para ver el resto de los grupos de esa persona' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4')
  ownerId?: string;

  @ApiPropertyOptional({
    enum: GroupStatus,
    default: GroupStatus.SEARCHING_MEMBERS,
    description: 'Por default solo se listan grupos buscando miembros (con cupo disponible).',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(GroupStatus)
  status?: GroupStatus;

  @ApiPropertyOptional({ description: 'true = solo grupos con al menos un cupo realmente libre (descontando los apartados). Es lo que usa el marketplace.' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : undefined))
  @IsBoolean()
  withSpots?: boolean;

  @ApiPropertyOptional({ enum: ['forming', 'running', 'freeing'], description: 'forming = todavía juntando cupos (no ha iniciado); running = ya iniciado y con días de servicio; freeing = ya iniciado y con un lugar que se libera al terminar el ciclo (se puede apartar).' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(['forming', 'running', 'freeing'])
  stage?: 'forming' | 'running' | 'freeing';

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
