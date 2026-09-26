import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCategoryDto): Promise<Category> {
    return this.prisma.category.create({ data: { name: dto.name } });
  }

  findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada.');
    }
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findById(id);
    return this.prisma.category.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    // Borrar una categoría solo desvincula los servicios que la tenían (platform_categories
    // tiene onDelete: Cascade en esa FK) — los servicios en sí no se tocan.
    await this.prisma.category.delete({ where: { id } });
  }
}
