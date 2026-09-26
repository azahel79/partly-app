import { ApiProperty } from '@nestjs/swagger';
import { ReviewResponseDto } from './review-response.dto';

export class PaginatedReviewsResponseDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  data: ReviewResponseDto[];

  @ApiProperty({ example: 8 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}
