import { ApiProperty } from '@nestjs/swagger';
import { Plan, Platform, ProviderListing, ProviderProfile } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

type ListingWithRelations = ProviderListing & {
  plan: Plan & { platform: Pick<Platform, 'id' | 'name' | 'logoUrl'> };
  providerProfile: Pick<ProviderProfile, 'id' | 'businessName'>;
};

class PlatformSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ nullable: true })
  @Expose()
  logoUrl: string | null;
}

// El plan completo del catálogo — así el vendedor ve gratis cuántos perfiles trae la cuenta
// y el precio oficial de la plataforma (para calcular su margen) sin que el admin lo capture aparte.
class PlanSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  tierName: string;

  @ApiProperty({ example: '270.00' })
  @Expose()
  officialPrice: string;

  @ApiProperty({ example: 5 })
  @Expose()
  maxSlots: number;

  @ApiProperty()
  @Expose()
  billingPeriod: string;

  @ApiProperty({ type: PlatformSummaryDto })
  @Expose()
  platform: PlatformSummaryDto;
}

class ProviderSummaryDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  businessName: string;
}

@Exclude()
export class ProviderListingResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-6d2a-4c7a-9f2e-2a6b9b1e2b10' })
  @Expose()
  id: string;

  @ApiProperty({ type: PlanSummaryDto })
  @Expose()
  plan: PlanSummaryDto;

  @ApiProperty({ type: ProviderSummaryDto })
  @Expose()
  providerProfile: ProviderSummaryDto;

  @ApiProperty({ example: '45.00' })
  @Expose()
  wholesalePrice: string;

  @ApiProperty({ example: 10 })
  @Expose()
  stockQuantity: number;

  @ApiProperty({ example: true })
  @Expose()
  active: boolean;

  @ApiProperty({ example: true, description: 'Renovable = misma cuenta con renovación; no renovable = se cambia cada periodo.' })
  @Expose()
  renewable: boolean;

  @ApiProperty({ example: 30, description: 'Días de vigencia de cada compra o renovación.' })
  @Expose()
  validityDays: number;

  @ApiProperty({ example: '2026-09-13T10:00:00.000Z' })
  @Expose()
  createdAt: Date;

  constructor(listing: ListingWithRelations) {
    this.id = listing.id;
    this.plan = {
      id: listing.plan.id,
      tierName: listing.plan.tierName,
      officialPrice: listing.plan.officialPrice.toString(),
      maxSlots: listing.plan.maxSlots,
      billingPeriod: listing.plan.billingPeriod,
      platform: { id: listing.plan.platform.id, name: listing.plan.platform.name, logoUrl: listing.plan.platform.logoUrl },
    };
    this.providerProfile = { id: listing.providerProfile.id, businessName: listing.providerProfile.businessName };
    this.wholesalePrice = listing.wholesalePrice.toString();
    this.stockQuantity = listing.stockQuantity;
    this.active = listing.active;
    this.renewable = listing.renewable;
    this.validityDays = listing.validityDays;
    this.createdAt = listing.createdAt;
  }
}
