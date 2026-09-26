import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class ListProviderListingsQueryDto {
  @ApiPropertyOptional({ description: 'Filtra por servicio de streaming (Netflix, Spotify...)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4')
  platformId?: string;

  @ApiPropertyOptional({ description: 'Filtra por un plan específico del catálogo' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID('4')
  planId?: string;

  @ApiPropertyOptional({ default: true, description: 'Por default solo se listan los activos.' })
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === undefined ? true : value === 'true' || value === true))
  @IsBoolean()
  active: boolean = true;

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
