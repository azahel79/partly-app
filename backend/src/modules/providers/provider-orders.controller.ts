import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { GroupResponseDto } from '../groups/dto/group-response.dto';
import { ProviderOrdersService } from './provider-orders.service';
import { CreateProviderOrderDto } from './dto/create-provider-order.dto';
import { DeliverProviderOrderCredentialDto } from './dto/deliver-provider-order-credential.dto';
import { ListProviderOrdersQueryDto } from './dto/list-provider-orders-query.dto';
import { ProviderOrderResponseDto } from './dto/provider-order-response.dto';
import { PaginatedProviderOrdersResponseDto } from './dto/paginated-provider-orders-response.dto';
import { ProviderOrderCredentialResponseDto } from './dto/provider-order-credential-response.dto';
import { CreateGroupFromProviderOrderDto } from './dto/create-group-from-provider-order.dto';
import { RejectProviderOrderDto } from './dto/reject-provider-order.dto';

const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

@ApiTags('provider-orders')
@Controller('provider-orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProviderOrdersController {
  constructor(private readonly providerOrdersService: ProviderOrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Reserva una cuenta del mayoreo — tienes un plazo para transferir y subir tu comprobante',
    description:
      'Solo para vendedores con acceso al mayoreo autorizado. El stock se aparta de inmediato; si no subes el comprobante a tiempo la reserva se cancela sola. ' +
      'El pago es por transferencia a la cuenta de Vakeva (GET /commissions/bank-account) y el proveedor lo valida al aprobar.',
  })
  @ApiResponse({ status: 201, type: ProviderOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Sin stock, servicio inactivo o Vakeva sin cuenta de pago publicada.' })
  @ApiResponse({ status: 403, description: 'Sin acceso al mayoreo, tope mensual alcanzado o comisión vencida.' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProviderOrderDto,
  ): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.create(user.id, dto);
    return new ProviderOrderResponseDto(order);
  }

  @Get('me')
  @ApiOperation({ summary: 'Tus compras a proveedores (como vendedor)' })
  @ApiResponse({ status: 200, type: PaginatedProviderOrdersResponseDto })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProviderOrdersQueryDto,
  ): Promise<PaginatedProviderOrdersResponseDto> {
    const { data, total } = await this.providerOrdersService.findMine(user.id, query);
    return {
      data: data.map((o) => new ProviderOrderResponseDto(o)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get('provider-me')
  @ApiOperation({ summary: 'Tus ventas como proveedor' })
  @ApiResponse({ status: 200, type: PaginatedProviderOrdersResponseDto })
  async findAsProvider(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProviderOrdersQueryDto,
  ): Promise<PaginatedProviderOrdersResponseDto> {
    const { data, total } = await this.providerOrdersService.findAsProvider(user.id, query);
    return {
      data: data.map((o) => new ProviderOrderResponseDto(o)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una orden (comprador, proveedor o ADMIN)' })
  @ApiResponse({ status: 200, type: ProviderOrderResponseDto })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderResponseDto> {
    const { order, buyer } = await this.providerOrdersService.findByIdForUser(id, user);
    return new ProviderOrderResponseDto(order, buyer);
  }

  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_RECEIPT_SIZE_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sube el comprobante de tu transferencia (JPG, PNG, WEBP o PDF, hasta 8MB)' })
  @ApiResponse({ status: 201, type: ProviderOrderResponseDto })
  async uploadReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderResponseDto> {
    if (!file) {
      throw new BadRequestException('Falta el archivo del comprobante (campo "file").');
    }
    const order = await this.providerOrdersService.uploadReceipt(id, user.id, file);
    return new ProviderOrderResponseDto(order);
  }

  @Get(':id/receipt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descarga el comprobante de una compra (el comprador, el proveedor o un ADMIN)' })
  async getReceipt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const { absolutePath, filename } = await this.providerOrdersService.getReceiptFilePath(id, user);
    res.sendFile(absolutePath, { headers: { 'Content-Disposition': `inline; filename="${filename}"` } });
  }

  @Put(':id/approve')
  @ApiOperation({
    summary: 'Valida el pago de una compra (solo el proveedor): el dinero ya llegó a tu banco',
    description: 'Una compra pasa a esperar la entrega de la cuenta; una renovación alarga la vigencia de la cuenta original.',
  })
  @ApiResponse({ status: 200, type: ProviderOrderResponseDto })
  @ApiResponse({ status: 400, description: 'No hay un comprobante esperando validación.' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.approve(id, user.id);
    return new ProviderOrderResponseDto(order);
  }

  @Put(':id/reject-receipt')
  @ApiOperation({ summary: 'El comprobante no sirve: el comprador vuelve a esperar pago y puede subir otro (solo el proveedor)' })
  @ApiResponse({ status: 200, type: ProviderOrderResponseDto })
  async rejectReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProviderOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.rejectReceipt(id, user.id, dto.reason);
    return new ProviderOrderResponseDto(order);
  }

  @Put(':id/reject')
  @ApiOperation({ summary: 'Rechaza la solicitud de compra completa (solo el proveedor) — se libera el stock' })
  @ApiResponse({ status: 200, type: ProviderOrderResponseDto })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProviderOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.reject(id, user.id, dto.reason);
    return new ProviderOrderResponseDto(order);
  }

  @Put(':id/deliver')
  @ApiOperation({
    summary: 'Entrega las credenciales de la cuenta vendida (solo el proveedor que la vendió)',
    description: 'Se cifra (AES-256-GCM) antes de guardarse, igual que las credenciales de un Group.',
  })
  @ApiResponse({ status: 200, type: ProviderOrderResponseDto })
  @ApiResponse({ status: 403, description: 'No eres el proveedor que vendió esta orden.' })
  async deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliverProviderOrderCredentialDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.deliverCredential(id, dto, user.id);
    return new ProviderOrderResponseDto(order);
  }

  @Get(':id/credential')
  @ApiOperation({ summary: 'Ve la credencial descifrada de tu compra (solo el comprador)' })
  @ApiResponse({ status: 200, type: ProviderOrderCredentialResponseDto })
  @ApiResponse({ status: 404, description: 'El proveedor todavía no ha entregado las credenciales.' })
  async getCredential(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderCredentialResponseDto> {
    return this.providerOrdersService.getCredential(id, user.id);
  }

  @Post(':id/create-group')
  @ApiOperation({
    summary: 'Crea tu grupo a partir de esta compra ya entregada, con la credencial cargada automáticamente',
    description: 'Reutiliza el plan del catálogo de la cuenta comprada y copia la credencial ya entregada — no hace falta volver a escribirla.',
  })
  @ApiResponse({ status: 201, type: GroupResponseDto })
  @ApiResponse({ status: 400, description: 'La orden no tiene credenciales entregadas, o el plan ya no está activo.' })
  @ApiResponse({ status: 409, description: 'Ya creaste un grupo con esta compra.' })
  async createGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGroupFromProviderOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GroupResponseDto> {
    const group = await this.providerOrdersService.createGroup(id, user.id, dto);
    return new GroupResponseDto(group);
  }

  @Post(':id/renew')
  @ApiOperation({ summary: 'Renueva una cuenta renovable (a partir de 7 días antes de que venza): mismo flujo de pago' })
  @ApiResponse({ status: 201, type: ProviderOrderResponseDto })
  async renew(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.renew(id, user.id);
    return new ProviderOrderResponseDto(order);
  }

  @Post(':id/replace')
  @ApiOperation({ summary: 'Compra la reposición de una cuenta no renovable que venció o está por vencer' })
  @ApiResponse({ status: 201, type: ProviderOrderResponseDto })
  async replace(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.replace(id, user.id);
    return new ProviderOrderResponseDto(order);
  }

  @Post(':id/refunded')
  @ApiOperation({ summary: 'Marca como reembolsada una orden pagada y luego cancelada (solo el proveedor)' })
  @ApiResponse({ status: 201, type: ProviderOrderResponseDto })
  async markRefunded(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.markRefunded(id, user.id);
    return new ProviderOrderResponseDto(order);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancela/retira una compra (comprador o proveedor)',
    description: 'El comprador puede retirarla mientras su pago no se valide. Ya pagada, solo la cancela el proveedor y el reembolso queda pendiente.',
  })
  @ApiResponse({ status: 200, type: ProviderOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Ya fue entregada, o ya está cancelada/rechazada.' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProviderOrderResponseDto> {
    const order = await this.providerOrdersService.cancel(id, user.id);
    return new ProviderOrderResponseDto(order);
  }
}
