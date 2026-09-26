import { ApiProperty } from '@nestjs/swagger';
import { PayoutRequestResponseDto } from './payout-request-response.dto';

export class PaginatedPayoutsResponseDto {
  @ApiProperty({ type: [PayoutRequestResponseDto] })
  data: PayoutRequestResponseDto[];

  @ApiProperty({ example: 4 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}
