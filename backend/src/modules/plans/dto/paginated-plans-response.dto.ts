import { ApiProperty } from '@nestjs/swagger';
import { PlanResponseDto } from './plan-response.dto';

export class PaginatedPlansResponseDto {
  @ApiProperty({ type: [PlanResponseDto] })
  data: PlanResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
