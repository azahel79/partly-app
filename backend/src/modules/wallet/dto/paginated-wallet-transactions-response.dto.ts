import { ApiProperty } from '@nestjs/swagger';
import { WalletTransactionResponseDto } from './wallet-transaction-response.dto';

export class PaginatedWalletTransactionsResponseDto {
  @ApiProperty({ type: [WalletTransactionResponseDto] })
  data: WalletTransactionResponseDto[];

  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}
