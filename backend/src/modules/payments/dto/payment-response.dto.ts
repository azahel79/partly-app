import { ApiProperty } from '@nestjs/swagger';
import { Payment, PaymentStatus } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class PaymentResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ example: '32.50' })
  @Expose()
  amount: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PAID })
  @Expose()
  status: PaymentStatus;

  @ApiProperty({ nullable: true, example: '2026-10-17T00:00:00.000Z' })
  @Expose()
  graceUntil: Date | null;

  @ApiProperty({ nullable: true })
  @Expose()
  paidAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Cuándo se subió el comprobante — null si aún no hay ninguno.' })
  @Expose()
  receiptUploadedAt: Date | null;

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

  constructor(payment: Payment) {
    this.id = payment.id;
    this.amount = payment.amount.toString();
    this.status = payment.status;
    this.graceUntil = payment.graceUntil;
    this.paidAt = payment.paidAt;
    this.receiptUploadedAt = payment.receiptUploadedAt;
    this.coveredFrom = payment.coveredFrom;
    this.coveredUntil = payment.coveredUntil;
    this.proratedDays = payment.proratedDays;
    this.includesNextCycle = payment.includesNextCycle;
  }
}
