import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider, Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { decrypt, encrypt } from '../../common/utils/crypto.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface CreateLocalUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

interface CreateGoogleUserInput {
  name: string;
  email: string;
  googleId: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** Cuenta de abono del propio usuario, descifrada — solo se devuelve a su dueño para autocompletar el CLABE al crear un grupo. */
  async getPayoutAccount(userId: string): Promise<{ holder: string; bankName: string; clabe: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { payoutAccountHolder: true, payoutBankName: true, payoutClabeEncrypted: true },
    });
    if (!user?.payoutClabeEncrypted || !user.payoutBankName || !user.payoutAccountHolder) {
      return null;
    }
    const key = this.configService.getOrThrow<string>('credentialsEncryptionKey');
    return { holder: user.payoutAccountHolder, bankName: user.payoutBankName, clabe: decrypt(user.payoutClabeEncrypted, key) };
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  // Cada usuario nace con su wallet en la misma transacción: la relación
  // User<->Wallet es 1-1 obligatoria en el modelo, así que no debe existir
  // un usuario sin wallet ni un momento en que falte.
  createLocalUser(input: CreateLocalUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        authProvider: AuthProvider.LOCAL,
        emailVerified: true,
        wallet: { create: {} },
      },
    });
  }

  createGoogleUser(input: CreateGoogleUserInput): Promise<User> {
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        googleId: input.googleId,
        avatarUrl: input.avatarUrl,
        authProvider: AuthProvider.GOOGLE,
        emailVerified: true,
        wallet: { create: {} },
      },
    });
  }

  linkGoogleAccount(userId: string, googleId: string, avatarUrl?: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId,
        avatarUrl: avatarUrl ?? undefined,
        emailVerified: true,
      },
    });
  }

  markEmailVerified(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  async findMany(query: ListUsersQueryDto): Promise<{ data: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      authProvider: query.authProvider,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      phone: dto.phone,
      avatarUrl: dto.clearAvatar ? null : dto.avatarUrl,
      marketingOptOut: dto.marketingOptOut,
      emailNotifications: dto.emailNotifications,
      inAppNotifications: dto.inAppNotifications,
      notifyPayments: dto.notifyPayments,
      notifyGroups: dto.notifyGroups,
      notifyCredentials: dto.notifyCredentials,
      notifyPayouts: dto.notifyPayouts,
      profileNameVisible: dto.profileNameVisible,
      profileAvatarVisible: dto.profileAvatarVisible,
      timezone: dto.timezone,
    };

    if (dto.clearPayoutAccount) {
      data.payoutAccountHolder = null;
      data.payoutBankName = null;
      data.payoutClabeEncrypted = null;
      data.payoutClabeLast4 = null;
      data.payoutVerified = false;
    } else if (dto.payoutClabe) {
      if (!dto.payoutAccountHolder?.trim() || !dto.payoutBankName?.trim()) {
        throw new BadRequestException('Indica el titular y el banco de la cuenta de retiro.');
      }
      const encryptionKey = this.configService.getOrThrow<string>('credentialsEncryptionKey');
      data.payoutAccountHolder = dto.payoutAccountHolder.trim();
      data.payoutBankName = dto.payoutBankName.trim();
      data.payoutClabeEncrypted = encrypt(dto.payoutClabe, encryptionKey);
      data.payoutClabeLast4 = dto.payoutClabe.slice(-4);
      data.payoutVerified = false;
    }

    if (dto.newPassword) {
      if (user.authProvider !== AuthProvider.LOCAL || !user.passwordHash) {
        throw new BadRequestException('Esta cuenta inició sesión con Google y no tiene contraseña local que cambiar.');
      }
      if (!dto.currentPassword) {
        throw new BadRequestException('Debes indicar tu contraseña actual para poder cambiarla.');
      }

      const currentPasswordMatches = await argon2.verify(user.passwordHash, dto.currentPassword);
      if (!currentPasswordMatches) {
        throw new UnauthorizedException('La contraseña actual no es correcta.');
      }

      data.passwordHash = await argon2.hash(dto.newPassword);
    }

    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async getTrustSummary(userId: string) {
    const [ownedGroups, activeMemberships, paidPayments, reviewsWritten, payoutRequests] = await this.prisma.$transaction([
      this.prisma.group.count({ where: { ownerId: userId, status: { not: 'CANCELLED' } } }),
      this.prisma.groupMembership.count({ where: { userId, status: 'ACTIVE' } }),
      this.prisma.payment.count({ where: { membership: { userId }, status: 'PAID' } }),
      this.prisma.review.count({ where: { authorUserId: userId } }),
      this.prisma.payoutRequest.count({ where: { ownerId: userId, status: 'PAID' } }),
    ]);
    return { ownedGroups, activeMemberships, paidPayments, reviewsWritten, payoutRequests };
  }

  findActiveSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('La sesión ya no existe o fue cerrada.');
  }

  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true, authProvider: true,
        emailVerified: true, avatarUrl: true, ratingAvg: true, marketingOptOut: true,
        emailNotifications: true, inAppNotifications: true, notifyPayments: true,
        notifyGroups: true, notifyCredentials: true, notifyPayouts: true,
        profileNameVisible: true, profileAvatarVisible: true, timezone: true,
        payoutAccountHolder: true, payoutBankName: true, payoutClabeLast4: true,
        payoutVerified: true, createdAt: true, updatedAt: true,
        ownedGroups: { select: { id: true, status: true, createdAt: true, plan: { select: { tierName: true, platform: { select: { name: true } } } } } },
        memberships: { select: { id: true, status: true, joinedAt: true, leftAt: true, groupId: true } },
        payoutRequests: { select: { id: true, amount: true, status: true, requestedAt: true, paidAt: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return { exportedAt: new Date().toISOString(), profile: user };
  }

  /**
   * Derecho ARCO de Cancelación: no se borra la fila (para no romper historial de
   * pagos/grupos futuro que por ley haya que conservar), se anonimiza. El usuario
   * deja de poder loguearse (local o Google) y se revocan todas sus sesiones activas.
   */
  async cancelAccount(userId: string, currentPassword?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (user.deletedAt) {
      return; // ya estaba cancelada: idempotente
    }

    if (user.authProvider === AuthProvider.LOCAL && user.passwordHash) {
      if (!currentPassword || !(await argon2.verify(user.passwordHash, currentPassword))) {
        throw new UnauthorizedException('Confirma tu contraseña actual para eliminar la cuenta.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: 'Usuario eliminado',
          email: `deleted-${userId}@deleted.local`,
          phone: null,
          avatarUrl: null,
          payoutAccountHolder: null,
          payoutBankName: null,
          payoutClabeEncrypted: null,
          payoutClabeLast4: null,
          payoutVerified: false,
          passwordHash: null,
          googleId: null,
          deletedAt: new Date(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Cambia el rol de otro usuario. Dos protecciones para no dejar el sistema sin
   * administradores: un ADMIN no puede quitarse su propio rol, ni degradar al último
   * ADMIN que quede activo. Cada cambio queda auditado en admin_action_logs.
   */
  async updateRole(targetUserId: string, newRole: Role, actingAdminId: string): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (target.deletedAt) {
      throw new BadRequestException('No se puede cambiar el rol de una cuenta cancelada.');
    }
    if (target.role === newRole) {
      return target;
    }

    if (target.id === actingAdminId && newRole !== Role.ADMIN) {
      throw new BadRequestException('No puedes quitarte a ti mismo el rol de administrador.');
    }

    if (target.role === Role.ADMIN && newRole === Role.USER) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: { role: Role.ADMIN, deletedAt: null, id: { not: target.id } },
      });
      if (otherActiveAdmins === 0) {
        throw new BadRequestException('No puedes quitar el rol de administrador al último ADMIN del sistema.');
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: target.id }, data: { role: newRole } }),
      this.prisma.adminActionLog.create({
        data: {
          adminUserId: actingAdminId,
          actionType: 'ROLE_CHANGE',
          targetEntity: 'User',
          targetId: target.id,
          reason: `role: ${target.role} -> ${newRole}`,
        },
      }),
    ]);

    return updated;
  }
}
