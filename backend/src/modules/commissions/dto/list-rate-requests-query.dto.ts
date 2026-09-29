import { ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionRateRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListRateRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CommissionRateRequestStatus, description: 'Por defecto, las pendientes.' })
  @IsOptional()
  @IsEnum(CommissionRateRequestStatus)
  status?: CommissionRateRequestStatus;
}
