import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { ListPlatformsQueryDto } from './dto/list-platforms-query.dto';

const WITH_CATEGORIES = { categories: { include: { category: true } } } satisfies Prisma.PlatformInclude;

@Injectable()
export class PlatformsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCategoriesExist(categoryIds: string[]): Promise<void> {
    const found = await this.prisma.category.count({ where: { id: { in: categoryIds } } });
    if (found !== categoryIds.length) {
      throw new BadRequestException('Una o más categorías no existen.');
    }
  }

  async create(dto: CreatePlatformDto) {
    await this.assertCategoriesExist(dto.categoryIds);

    return this.prisma.platform.create({
      data: {
        name: dto.name,
        logoUrl: dto.logoUrl,
        active: dto.active ?? true,
        categories: { create: dto.categoryIds.map((categoryId) => ({ categoryId })) },
      },
      include: WITH_CATEGORIES,
    });
  }

  async findMany(query: ListPlatformsQueryDto) {
    const where: Prisma.PlatformWhereInput = {
      active: query.active,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.platform.findMany({
        where,
        include: WITH_CATEGORIES,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.platform.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string) {
    const platform = await this.prisma.platform.findUnique({ where: { id }, include: WITH_CATEGORIES });
    if (!platform) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    return platform;
  }

  async update(id: string, dto: UpdatePlatformDto) {
    await this.findById(id);
    if (dto.categoryIds) {
      await this.assertCategoriesExist(dto.categoryIds);
    }

    await this.prisma.$transaction([
      this.prisma.platform.update({
        where: { id },
        data: { name: dto.name, logoUrl: dto.logoUrl, active: dto.active },
      }),
      // Si mandan categoryIds, se reemplaza el set completo (borrar todo + recrear) en vez
      // de intentar hacer un diff — más simple y suficientemente barato para este catálogo.
      ...(dto.categoryIds
        ? [
            this.prisma.platformCategory.deleteMany({ where: { platformId: id } }),
            this.prisma.platformCategory.createMany({
              data: dto.categoryIds.map((categoryId) => ({ platformId: id, categoryId })),
            }),
          ]
        : []),
    ]);

    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.platform.delete({ where: { id } });
  }
}
