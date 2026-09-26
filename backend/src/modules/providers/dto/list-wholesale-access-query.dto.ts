import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { WholesaleAccessStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../commissions/dto/pagination-query.dto';

export class ListWholesaleAccessQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WholesaleAccessStatus, description: 'Por defecto, las solicitudes por revisar.' })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(WholesaleAccessStatus)
  status?: WholesaleAccessStatus;

  @ApiPropertyOptional({ description: 'Busca a cualquier usuario por nombre o correo (aunque nunca haya pedido acceso).' })
  @IsOptional()
  @IsString()
  search?: string;
}
