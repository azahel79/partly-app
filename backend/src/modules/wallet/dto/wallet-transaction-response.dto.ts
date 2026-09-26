import { ApiProperty } from '@nestjs/swagger';
import { WalletTransaction, WalletTransactionType } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class WalletTransactionResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: WalletTransactionType, example: WalletTransactionType.CREDIT })
  @Expose()
  type: WalletTransactionType;

  @ApiProperty({ example: '68.00' })
  @Expose()
  amount: string;

  @ApiProperty({ nullable: true })
  @Expose()
  relatedRef: string | null;

  @ApiProperty({ example: '2026-09-11T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  constructor(tx: WalletTransaction) {
    this.id = tx.id;
    this.type = tx.type;
    this.amount = tx.amount.toString();
    this.relatedRef = tx.relatedRef;
    this.createdAt = tx.createdAt;
  }
}
