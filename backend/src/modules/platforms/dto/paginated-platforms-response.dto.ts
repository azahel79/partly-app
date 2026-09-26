import { ApiProperty } from '@nestjs/swagger';
import { PlatformResponseDto } from './platform-response.dto';

export class PaginatedPlatformsResponseDto {
  @ApiProperty({ type: [PlatformResponseDto] })
  data: PlatformResponseDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}
