import { ApiProperty } from '@nestjs/swagger';
import { IncidentResponseDto } from './incident-response.dto';

export class PaginatedIncidentsResponseDto {
  @ApiProperty({ type: [IncidentResponseDto] })
  data: IncidentResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
