import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';

const WITH_PLATFORM = { platform: { select: { id: true, name: true } } } satisfies Prisma.PlanInclude;

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPlatformExists(platformId: string): Promise<void> {
    const platform = await this.prisma.platform.findUnique({ where: { id: platformId } });
    if (!platform) {
      throw new NotFoundException('El servicio (platformId) indicado no existe.');
    }
  }

  async create(dto: CreatePlanDto) {
    await this.assertPlatformExists(dto.platformId);

    return this.prisma.plan.create({
      data: {
        platformId: dto.platformId,
        tierName: dto.tierName,
        officialPrice: dto.officialPrice,
        maxSlots: dto.maxSlots,
        billingPeriod: dto.billingPeriod,
        commissionPercentage: dto.commissionPercentage,
        active: dto.active ?? true,
      },
      include: WITH_PLATFORM,
    });
  }

  async findMany(query: ListPlansQueryDto) {
    const where: Prisma.PlanWhereInput = {
      platformId: query.platformId,
      active: query.active,
    };

    const [data, total] = await Promise.all([
      this.prisma.plan.findMany({
        where,
        include: WITH_PLATFORM,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { tierName: 'asc' },
      }),
      this.prisma.plan.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id }, include: WITH_PLATFORM });
    if (!plan) {
      throw new NotFoundException('Plan no encontrado.');
    }
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findById(id);
    if (dto.platformId) {
      await this.assertPlatformExists(dto.platformId);
    }

    return this.prisma.plan.update({
      where: { id },
      data: {
        platformId: dto.platformId,
        tierName: dto.tierName,
        officialPrice: dto.officialPrice,
        maxSlots: dto.maxSlots,
        billingPeriod: dto.billingPeriod,
        commissionPercentage: dto.commissionPercentage,
        active: dto.active,
      },
      include: WITH_PLATFORM,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.plan.delete({ where: { id } });
  }
}
