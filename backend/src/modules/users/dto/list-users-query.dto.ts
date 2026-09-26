import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuthProvider, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: Role, description: 'Filtra por rol' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: AuthProvider, description: 'Filtra por método de login' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(AuthProvider)
  authProvider?: AuthProvider;

  @ApiPropertyOptional({ description: 'Busca por nombre o correo (coincidencia parcial, sin distinguir mayúsculas)' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  search?: string;

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
