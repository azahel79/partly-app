import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuthProvider } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { addDuration } from '../../common/utils/duration.util';
import { generateOpaqueToken, sha256 } from '../../common/utils/hash.util';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { AccessTokenPayload, AuthenticatedUser, GoogleProfilePayload, RequestMeta } from './types/jwt-payload.interface';

const FORGOT_PASSWORD_GENERIC_RESPONSE: MessageResponseDto = {
  message: 'Si el correo existe en nuestro sistema, te enviamos instrucciones para restablecer tu contraseña.',
};

// Hash "señuelo" (de una contraseña que nadie usa) contra el que verificamos cuando el correo no
// existe o no tiene contraseña local — así argon2.verify tarda lo mismo exista o no la cuenta, y
// un atacante no puede usar el tiempo de respuesta de /auth/login para enumerar correos registrados.
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$Bg4BMFIARmCgf1m4GK/r1g$GQd07sEv8BtO49e+QQAhsoWljxy2lY1zrCsfWPatvZI';

@Injectable()
export class AuthService {
  // Códigos de un solo uso para el canje de login con Google (ver loginWithGoogle).
  // En memoria: vida corta (60s) y de un solo proceso, suficiente mientras el backend
  // corra en una sola instancia; si se escala horizontalmente habría que moverlo a Redis.
  private readonly googleExchangeCodes = new Map<string, { session: LoginResponseDto; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Ese correo ya está registrado. Intenta iniciar sesión.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersService.createLocalUser({
      name: dto.name,
      email: dto.email,
      passwordHash,
    });

    // Verificación de correo desactivada de momento: la cuenta queda lista
    // para usarse de inmediato, sin depender de un proveedor de correo real.
    return this.loginLocal({ id: user.id, email: user.email, role: user.role, name: user.name }, meta);
  }

  async validateLocalUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.usersService.findByEmail(email);
    const hashToVerify = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    // Siempre corre argon2.verify, exista o no la cuenta, para que el tiempo de respuesta no
    // delate qué correos están registrados (ver DUMMY_PASSWORD_HASH arriba).
    const passwordMatches = await argon2.verify(hashToVerify, password);

    if (!user || !user.passwordHash || user.deletedAt || !passwordMatches) {
      return null;
    }

    return { id: user.id, email: user.email, role: user.role, name: user.name };
  }

  async loginLocal(user: AuthenticatedUser, meta: RequestMeta) {
    return this.issueSession(user, meta);
  }

  /**
   * Login con Google: en vez de devolver los tokens directamente (que terminarían
   * expuestos en la URL de redirección, historial del navegador y logs), genera un
   * código de un solo uso de vida corta. El frontend lo canjea vía POST /auth/google/exchange.
   */
  async loginWithGoogle(profile: GoogleProfilePayload, meta: RequestMeta): Promise<string> {
    let user = await this.usersService.findByGoogleId(profile.googleId);

    if (!user) {
      const existingByEmail = await this.usersService.findByEmail(profile.email);
      user = existingByEmail
        ? await this.usersService.linkGoogleAccount(existingByEmail.id, profile.googleId, profile.avatarUrl)
        : await this.usersService.createGoogleUser(profile);
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    const session = await this.issueSession(authenticatedUser, meta);
    return this.storeGoogleExchangeCode(session);
  }

  /** Canjea el código de un solo uso emitido por el callback de Google por la sesión real. */
  exchangeGoogleCode(code: string): LoginResponseDto {
    const entry = this.googleExchangeCodes.get(code);
    this.googleExchangeCodes.delete(code);

    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('El código de intercambio es inválido o ya expiró.');
    }

    return entry.session;
  }

  private storeGoogleExchangeCode(session: LoginResponseDto): string {
    const code = generateOpaqueToken();
    this.googleExchangeCodes.set(code, { session, expiresAt: Date.now() + 60_000 });
    setTimeout(() => this.googleExchangeCodes.delete(code), 60_000).unref();
    return code;
  }

  private async issueSession(user: AuthenticatedUser, meta: RequestMeta): Promise<LoginResponseDto> {
    const tokens = await this.issueTokens(user, meta);
    const fullUser = await this.usersService.findById(user.id);
    return { ...tokens, user: new UserResponseDto(fullUser!) };
  }

  async issueTokens(user: AuthenticatedUser, meta: RequestMeta) {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      expiresIn: this.configService.get<string>('jwt.accessExpiresIn') as JwtSignOptions['expiresIn'],
    });

    const refreshTokenPlain = generateOpaqueToken();
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn')!;

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshTokenPlain),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: addDuration(new Date(), refreshExpiresIn),
      },
    });

    return { accessToken, refreshToken: refreshTokenPlain };
  }

  async refreshTokens(refreshTokenPlain: string, meta: RequestMeta) {
    const tokenHash = sha256(refreshTokenPlain);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException('El refresh token es inválido o ya expiró.');
    }

    if (record.revokedAt) {
      // Un refresh token ya rotado/revocado que vuelve a presentarse es la señal
      // clásica de que fue robado (alguien más lo usó, o lo reenvían por error).
      // Ante la duda, se revocan TODAS las sesiones del usuario, no solo esta.
      await this.logoutAll(record.userId);
      throw new UnauthorizedException('El refresh token ya fue usado. Por seguridad se cerraron todas tus sesiones.');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('El refresh token es inválido o ya expiró.');
    }

    // Rotación: el refresh token usado queda revocado y se emite un par nuevo.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findById(record.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('El usuario de este token ya no existe.');
    }

    return this.issueTokens({ id: user.id, email: user.email, role: user.role, name: user.name }, meta);
  }

  /**
   * Siempre resuelve con el mismo mensaje genérico, exista o no el correo, para no
   * revelar por esta vía si una dirección está registrada (protección anti-enumeración).
   * El trabajo real (si aplica) pasa por dentro, nunca se refleja en la respuesta HTTP.
   */
  async forgotPassword(email: string): Promise<MessageResponseDto> {
    const user = await this.usersService.findByEmail(email);

    if (!user || user.deletedAt) {
      return FORGOT_PASSWORD_GENERIC_RESPONSE;
    }

    if (user.authProvider !== AuthProvider.LOCAL || !user.passwordHash) {
      // Cuenta que solo usa Google: no le agregamos una contraseña local por esta vía.
      await this.mailService.sendGoogleAccountNotice(user.email);
      return FORGOT_PASSWORD_GENERIC_RESPONSE;
    }

    // Invalida cualquier link de reset anterior sin usar, para que solo el más reciente sirva.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const resetTokenPlain = generateOpaqueToken();
    const expiresIn = this.configService.get<string>('passwordReset.expiresIn')!;
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(resetTokenPlain),
        expiresAt: addDuration(new Date(), expiresIn),
      },
    });

    const frontendUrl = this.configService.get<string>('frontendUrl');
    const resetUrl = new URL('/reset-password', frontendUrl);
    resetUrl.searchParams.set('token', resetTokenPlain);
    await this.mailService.sendPasswordResetEmail(user.email, resetUrl.toString());

    return FORGOT_PASSWORD_GENERIC_RESPONSE;
  }

  async resetPassword(resetTokenPlain: string, newPassword: string, meta: RequestMeta): Promise<LoginResponseDto> {
    const tokenHash = sha256(resetTokenPlain);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('El enlace de restablecimiento es inválido o ya expiró.');
    }

    const user = await this.usersService.findById(record.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('El enlace de restablecimiento es inválido o ya expiró.');
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // La contraseña cambió: por seguridad se cierran todas las sesiones existentes.
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    return this.issueSession({ id: user.id, email: user.email, role: user.role, name: user.name }, meta);
  }

  async logout(refreshTokenPlain: string): Promise<{ message: string }> {
    const tokenHash = sha256(refreshTokenPlain);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Sesión cerrada.' };
  }

  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Se cerraron todas las sesiones activas.' };
  }
}
