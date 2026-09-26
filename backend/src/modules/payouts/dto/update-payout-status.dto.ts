import { ApiProperty } from '@nestjs/swagger';
import { PayoutStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePayoutStatusDto {
  @ApiProperty({
    enum: [PayoutStatus.PROCESSING, PayoutStatus.PAID, PayoutStatus.FAILED],
    example: PayoutStatus.PROCESSING,
    description: 'PENDING → PROCESSING → PAID, o a FAILED desde PENDING/PROCESSING (reembolsa el wallet).',
  })
  @IsEnum(PayoutStatus)
  status: PayoutStatus;
}
