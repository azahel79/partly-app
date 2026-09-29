import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderProfileStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { CreateProviderListingDto } from './dto/create-provider-listing.dto';
import { UpdateProviderListingDto } from './dto/update-provider-listing.dto';
import { ListProviderListingsQueryDto } from './dto/list-provider-listings-query.dto';
import { DEFAULT_COMMISSION_PCT } from '../commissions/commissions.constants';

const WITH_RELATIONS = {
  plan: { include: { platform: { select: { id: true, name: true, logoUrl: true } } } },
  providerProfile: { select: { id: true, businessName: true } },
} satisfies Prisma.ProviderListingInclude;

// Solo un valor de referencia con el que nace el Plan — la comisión real que se cobra a
// cada grupo la asigna un ADMIN al aprobarlo (ver GroupsService.reviewApproval), así que
// este número no afecta lo que de verdad se cobra.

@Injectable()
export class ProviderListingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getApprovedProfileOrThrow(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile || profile.status !== ProviderProfileStatus.APPROVED) {
      throw new ForbiddenException('Necesitas un perfil de proveedor aprobado para publicar servicios.');
    }
    return profile;
  }

  async create(userId: string, dto: CreateProviderListingDto) {
    const profile = await this.getApprovedProfileOrThrow(userId);
    const planId = await this.resolvePlanId(dto);

    return this.prisma.providerListing.create({
      data: {
        providerProfileId: profile.id,
        planId,
        wholesalePrice: dto.wholesalePrice,
        stockQuantity: dto.stockQuantity,
        renewable: dto.renewable,
        validityDays: dto.validityDays,
      },
      include: WITH_RELATIONS,
    });
  }

  /**
   * Le da al admin control total sobre lo que publica: si manda planId reutiliza un plan
   * ya existente, pero si no, define la plataforma, el tier, el precio oficial y los cupos
   * a mano — igual que un vendedor declarando su propia plataforma en Group. Reusa el
   * Platform por nombre si ya existe, para no duplicar el mismo servicio dos veces.
   */
  private async resolvePlanId(dto: CreateProviderListingDto): Promise<string> {
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan || !plan.active) {
        throw new NotFoundException('El plan indicado no existe o ya no está activo.');
      }
      return plan.id;
    }

    if (!dto.platformName || !dto.maxSlots || !dto.officialPrice) {
      throw new BadRequestException('Indica plataforma, precio oficial y cupos, o elige un plan existente.');
    }

    let platform = await this.prisma.platform.findFirst({
      where: { name: { equals: dto.platformName.trim(), mode: 'insensitive' } },
    });
    if (!platform) {
      platform = await this.prisma.platform.create({ data: { name: dto.platformName.trim(), active: true } });
    }

    const plan = await this.prisma.plan.create({
      data: {
        platformId: platform.id,
        tierName: dto.tierName?.trim() || 'Estándar',
        officialPrice: dto.officialPrice,
        maxSlots: dto.maxSlots,
        billingPeriod: dto.billingPeriod,
        commissionPercentage: DEFAULT_COMMISSION_PCT,
        active: true,
      },
    });
    return plan.id;
  }

  async findMany(query: ListProviderListingsQueryDto) {
    const where: Prisma.ProviderListingWhereInput = {
      active: query.active,
      planId: query.planId,
      plan: query.platformId ? { platformId: query.platformId } : undefined,
    };
    const [data, total] = await Promise.all([
      this.prisma.providerListing.findMany({
        where,
        include: WITH_RELATIONS,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerListing.count({ where }),
    ]);
    return { data, total };
  }

  async findMine(userId: string) {
    const profile = await this.prisma.providerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('Todavía no tienes un perfil de proveedor.');
    }
    return this.prisma.providerListing.findMany({
      where: { providerProfileId: profile.id },
      include: WITH_RELATIONS,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const listing = await this.prisma.providerListing.findUnique({ where: { id }, include: WITH_RELATIONS });
    if (!listing) {
      throw new NotFoundException('Servicio de proveedor no encontrado.');
    }
    return listing;
  }

  async update(id: string, dto: UpdateProviderListingDto, requester: AuthenticatedUser) {
    const listing = await this.prisma.providerListing.findUnique({
      where: { id },
      include: { providerProfile: true },
    });
    if (!listing) {
      throw new NotFoundException('Servicio de proveedor no encontrado.');
    }
    if (listing.providerProfile.userId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo el proveedor dueño de este servicio (o un ADMIN) puede editarlo.');
    }

    return this.prisma.providerListing.update({
      where: { id },
      data: {
        wholesalePrice: dto.wholesalePrice,
        stockQuantity: dto.stockQuantity,
        active: dto.active,
        renewable: dto.renewable,
        validityDays: dto.validityDays,
      },
      include: WITH_RELATIONS,
    });
  }
}
