import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderProfileStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class ListProviderProfilesQueryDto {
  @ApiPropertyOptional({ enum: ProviderProfileStatus })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(ProviderProfileStatus)
  status?: ProviderProfileStatus;

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
