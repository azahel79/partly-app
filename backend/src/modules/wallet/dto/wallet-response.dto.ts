import { ApiProperty } from '@nestjs/swagger';
import { Wallet } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class WalletResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ example: '145.50' })
  @Expose()
  balance: string;

  @ApiProperty({ example: 'MXN' })
  @Expose()
  currency: string;

  constructor(wallet: Wallet) {
    this.id = wallet.id;
    this.balance = wallet.balance.toString();
    this.currency = wallet.currency;
  }
}
