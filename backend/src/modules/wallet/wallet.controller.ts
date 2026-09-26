import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.interface';
import { WalletService } from './wallet.service';
import { WalletResponseDto } from './dto/wallet-response.dto';
import { WalletTransactionResponseDto } from './dto/wallet-transaction-response.dto';
import { ListWalletTransactionsQueryDto } from './dto/list-wallet-transactions-query.dto';
import { PaginatedWalletTransactionsResponseDto } from './dto/paginated-wallet-transactions-response.dto';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tu saldo actual' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async getMyWallet(@CurrentUser() user: AuthenticatedUser): Promise<WalletResponseDto> {
    const wallet = await this.walletService.getByUserId(user.id);
    return new WalletResponseDto(wallet);
  }

  @Get('me/transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tu historial de movimientos (abonos por pagos confirmados, retiros, etc.)' })
  @ApiResponse({ status: 200, type: PaginatedWalletTransactionsResponseDto })
  async getMyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWalletTransactionsQueryDto,
  ): Promise<PaginatedWalletTransactionsResponseDto> {
    const { data, total } = await this.walletService.findTransactions(user.id, query);
    return {
      data: data.map((t) => new WalletTransactionResponseDto(t)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  @Get(':userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ve el wallet de cualquier usuario (solo ADMIN, para soporte/auditoría financiera)' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  async getWallet(@Param('userId', ParseUUIDPipe) userId: string): Promise<WalletResponseDto> {
    const wallet = await this.walletService.getByUserId(userId);
    return new WalletResponseDto(wallet);
  }
}
