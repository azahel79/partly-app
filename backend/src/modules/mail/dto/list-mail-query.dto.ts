import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { EmailStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../commissions/dto/pagination-query.dto';

export class ListMailQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EmailStatus })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(EmailStatus)
  status?: EmailStatus;

  @ApiPropertyOptional({ description: 'Busca por destinatario o asunto.' })
  @IsOptional()
  @IsString()
  search?: string;
}
