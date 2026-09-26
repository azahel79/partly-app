import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod, Plan, Platform } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type PlanWithPlatform = Plan & { platform: Pick<Platform, 'id' | 'name'> };

class PlatformSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;
}

@Exclude()
export class PlanResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ type: PlatformSummaryDto })
  @Expose()
  platform: PlatformSummaryDto;

  @ApiProperty({ example: 'Premium 4 pantallas' })
  @Expose()
  tierName: string;

  @ApiProperty({ example: '249.00' })
  @Expose()
  officialPrice: string;

  @ApiProperty({ example: 4 })
  @Expose()
  maxSlots: number;

  @ApiProperty({ enum: BillingPeriod, example: BillingPeriod.MONTHLY })
  @Expose()
  billingPeriod: BillingPeriod;

  @ApiProperty({ example: '15.00' })
  @Expose()
  commissionPercentage: string;

  @ApiProperty({ example: true })
  @Expose()
  active: boolean;

  constructor(plan: PlanWithPlatform) {
    this.id = plan.id;
    this.platform = { id: plan.platform.id, name: plan.platform.name };
    this.tierName = plan.tierName;
    this.officialPrice = plan.officialPrice.toString();
    this.maxSlots = plan.maxSlots;
    this.billingPeriod = plan.billingPeriod;
    this.commissionPercentage = plan.commissionPercentage.toString();
    this.active = plan.active;
  }
}
