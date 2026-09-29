import { ApiProperty } from '@nestjs/swagger';
import { PayoutAccountType, PayoutRequest, PayoutStatus, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

export interface PayoutDestination {
  holder: string;
  bankName: string;
  accountType: PayoutAccountType | null;
  accountNumber: string;
}

type PayoutWithOwner = PayoutRequest & { owner?: Pick<User, 'id' | 'name' | 'email'>; destination?: PayoutDestination | null };

class PayoutOwnerDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  email: string;
}

@Exclude()
export class PayoutRequestResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ type: PayoutOwnerDto, required: false })
  @Expose()
  owner?: PayoutOwnerDto;

  @ApiProperty({ example: '100.00' })
  @Expose()
  amount: string;

  @ApiProperty({ enum: PayoutStatus, example: PayoutStatus.PENDING })
  @Expose()
  status: PayoutStatus;

  @ApiProperty({ example: 'Transferencia SPEI a cuenta terminación 1234' })
  @Expose()
  method: string;

  @ApiProperty({ example: '2026-09-12T10:00:00.000Z' })
  @Expose()
  requestedAt: Date;

  @ApiProperty({ nullable: true })
  @Expose()
  paidAt: Date | null;

  @ApiProperty({ required: false, nullable: true, description: 'Cuenta de abono descifrada — solo la ve un ADMIN en la cola de retiros.' })
  @Expose()
  destination?: PayoutDestination | null;

  constructor(payout: PayoutWithOwner) {
    this.destination = payout.destination;
    this.id = payout.id;
    if (payout.owner) {
      this.owner = { id: payout.owner.id, name: payout.owner.name, email: payout.owner.email };
    }
    this.amount = payout.amount.toString();
    this.status = payout.status;
    this.method = payout.method;
    this.requestedAt = payout.requestedAt;
    this.paidAt = payout.paidAt;
  }
}
