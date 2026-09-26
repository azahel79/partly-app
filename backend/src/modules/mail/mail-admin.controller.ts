import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailStatus, Prisma, Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { ListMailQueryDto } from './dto/list-mail-query.dto';
import { SendTestMailDto } from './dto/send-test-mail.dto';
import { MailService } from './mail.service';

const LIST_SELECT = {
  id: true,
  toEmail: true,
  toUserId: true,
  template: true,
  subject: true,
  status: true,
  provider: true,
  error: true,
  attempts: true,
  sendAfter: true,
  createdAt: true,
  sentAt: true,
} satisfies Prisma.EmailMessageSelect;

/** Bandeja de salida para el admin: qué correos salieron (o se simularon), cuáles fallaron y si el envío está configurado. */
@ApiTags('admin')
@Controller('admin/mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class MailAdminController {
  constructor(
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Proveedor de correo configurado, qué le falta y conteo de la bandeja de salida' })
  async getStatus() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [byStatus, sentLast24h] = await Promise.all([
      this.prisma.emailMessage.groupBy({ by: ['status'], _count: true }),
      this.prisma.emailMessage.count({ where: { status: EmailStatus.SENT, sentAt: { gte: since } } }),
    ]);
    const count = (status: EmailStatus) => byStatus.find((row) => row.status === status)?._count ?? 0;
    return {
      ...this.mailService.getStatus(),
      counts: {
        queued: count(EmailStatus.QUEUED) + count(EmailStatus.SENDING),
        sent: count(EmailStatus.SENT),
        failed: count(EmailStatus.FAILED),
        skipped: count(EmailStatus.SKIPPED),
        sentLast24h,
      },
    };
  }

  @Get('messages')
  @ApiOperation({ summary: 'Correos de la bandeja de salida (sin el cuerpo)' })
  async list(@Query() query: ListMailQueryDto) {
    const where: Prisma.EmailMessageWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { OR: [{ toEmail: { contains: query.search, mode: 'insensitive' } }, { subject: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.emailMessage.findMany({ where, select: LIST_SELECT, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.emailMessage.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) || 1 };
  }

  @Get('messages/:id')
  @ApiOperation({ summary: 'Un correo completo (HTML y texto) para verlo tal como le llegó a la persona' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const message = await this.prisma.emailMessage.findUnique({ where: { id } });
    if (!message) {
      throw new NotFoundException('Correo no encontrado.');
    }
    return message;
  }

  @Post('messages/:id/retry')
  @ApiOperation({ summary: 'Reintenta un correo fallido' })
  async retry(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.mailService.retry(id);
    if (!result) {
      throw new BadRequestException('Solo se pueden reintentar los correos fallidos o que se omitieron.');
    }
    return result;
  }

  @Post('test')
  @ApiOperation({ summary: 'Manda un correo de prueba (por defecto a tu propio correo) para comprobar la configuración' })
  async sendTest(@Body() dto: SendTestMailDto, @CurrentUser() admin: AuthenticatedUser) {
    const to = dto.to ?? (await this.prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: { email: true } })).email;
    return this.mailService.sendTest(to);
  }
}
