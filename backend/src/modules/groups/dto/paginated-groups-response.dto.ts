import { ApiProperty } from '@nestjs/swagger';
import { GroupResponseDto } from './group-response.dto';

export class PaginatedGroupsResponseDto {
  @ApiProperty({ type: [GroupResponseDto] })
  data: GroupResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
