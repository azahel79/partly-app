import { ApiProperty } from '@nestjs/swagger';
import { MembershipStatus, Payment, PaymentStatus, User } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type PendingPaymentWithMember = Payment & {
  membership: { status: MembershipStatus; user: Pick<User, 'id' | 'name' | 'avatarUrl'> };
};

class MemberSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ nullable: true })
  @Expose()
  avatarUrl: string | null;
}

@Exclude()
export class PendingPaymentResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ type: MemberSummaryDto })
  @Expose()
  member: MemberSummaryDto;

  @ApiProperty({ example: '65.00' })
  @Expose()
  amount: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PENDING })
  @Expose()
  status: PaymentStatus;

  @ApiProperty({ nullable: true })
  @Expose()
  receiptUploadedAt: Date | null;

  @ApiProperty({ nullable: true, example: '2026-10-17T00:00:00.000Z' })
  @Expose()
  graceUntil: Date | null;

  @ApiProperty({
    enum: MembershipStatus,
    example: MembershipStatus.PENDING_PAYMENT,
    description: 'PENDING_PAYMENT = su primer pago, hay que asignarle un perfil al aprobar. ACTIVE = renovación, conserva el que ya tenía.',
  })
  @Expose()
  membershipStatus: MembershipStatus;

  @ApiProperty({ nullable: true, description: 'Desde cuándo cubre este pago.' })
  @Expose()
  coveredFrom: Date | null;

  @ApiProperty({ nullable: true, description: 'Hasta cuándo cubre este pago.' })
  @Expose()
  coveredUntil: Date | null;

  @ApiProperty({ nullable: true, description: 'Días del ciclo que cubre cuando entró a mitad de ciclo (prorrateo). Null = ciclo completo.' })
  @Expose()
  proratedDays: number | null;

  @ApiProperty({ description: 'true cuando además del prorrateo pagó el ciclo siguiente completo (entró con muy pocos días restantes).' })
  @Expose()
  includesNextCycle: boolean;

  constructor(payment: PendingPaymentWithMember) {
    this.id = payment.id;
    this.coveredFrom = payment.coveredFrom;
    this.coveredUntil = payment.coveredUntil;
    this.proratedDays = payment.proratedDays;
    this.includesNextCycle = payment.includesNextCycle;
    this.member = {
      id: payment.membership.user.id,
      name: payment.membership.user.name,
      avatarUrl: payment.membership.user.avatarUrl,
    };
    this.amount = payment.amount.toString();
    this.status = payment.status;
    this.receiptUploadedAt = payment.receiptUploadedAt;
    this.graceUntil = payment.graceUntil;
    this.membershipStatus = payment.membership.status;
  }
}
