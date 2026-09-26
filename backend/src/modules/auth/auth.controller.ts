import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ExchangeGoogleCodeDto } from './dto/exchange-google-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser, GoogleProfilePayload, RequestMeta } from './types/jwt-payload.interface';

function requestMeta(req: Request): RequestMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Crea una cuenta con correo y contraseña (vendedor/comprador por defecto: USER)',
    description:
      'Verificación de correo desactivada de momento: la cuenta queda activa y logueada de inmediato, ' +
      'devolviendo la misma sesión que /auth/login (tokens + perfil).',
  })
  @ApiResponse({ status: 201, type: LoginResponseDto })
  @ApiResponse({ status: 409, description: 'El correo ya está registrado.' })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.authService.register(dto, requestMeta(req));
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con correo y contraseña' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o correo sin verificar.' })
  login(
    @Body() _dto: LoginDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
    return this.authService.loginLocal(user, requestMeta(req));
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Inicia el login con Google (abrir en navegador, no probar aquí)',
    description:
      'Passport intercepta esta ruta y redirige (302) a la pantalla de consentimiento de Google. ' +
      'Es una navegación de navegador, no una llamada JSON: ábrela directamente en una pestaña, ' +
      'por ejemplo http://localhost:3000/api/auth/google.',
  })
  @ApiResponse({ status: 302, description: 'Redirige a accounts.google.com para el consentimiento.' })
  googleAuth(): void {
    // Passport intercepta esta ruta y redirige a la pantalla de consentimiento de Google.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Callback de Google OAuth (lo invoca Google, no se llama manualmente)',
    description:
      'Google redirige aquí tras el consentimiento. La app valida el perfil, crea/actualiza el usuario, y ' +
      'redirige al frontend (FRONTEND_URL + /oauth/callback) con un código de un solo uso (?code=), NO con ' +
      'los tokens directamente — así evitamos que accessToken/refreshToken queden en la URL, el historial ' +
      'del navegador o los logs. El frontend debe canjear ese código con POST /auth/google/exchange.',
  })
  @ApiResponse({ status: 302, description: 'Redirige al frontend con un código de un solo uso (?code=...).' })
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfilePayload;
    const code = await this.authService.loginWithGoogle(profile, requestMeta(req));

    const frontendUrl = this.configService.get<string>('frontendUrl');
    const redirectUrl = new URL('/oauth/callback', frontendUrl);
    redirectUrl.searchParams.set('code', code);

    res.redirect(redirectUrl.toString());
  }

  @Post('google/exchange')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Canjea el código de un solo uso del callback de Google por tokens + perfil',
    description: 'El código expira a los 60 segundos y solo puede usarse una vez.',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Código inválido, ya usado o expirado.' })
  exchangeGoogleCode(@Body() dto: ExchangeGoogleCodeDto): LoginResponseDto {
    return this.authService.exchangeGoogleCode(dto.code);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia un refresh token por un par nuevo (rotación)' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido, revocado o expirado.' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.authService.refreshTokens(dto.refreshToken, requestMeta(req));
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicita restablecer contraseña',
    description:
      'Siempre responde con el mismo mensaje genérico, exista o no el correo (protección anti-enumeración). ' +
      'Si la cuenta es local, envía un enlace de un solo uso válido por 30 minutos. Si la cuenta es de Google, ' +
      'envía un aviso de que debe iniciar sesión así, sin generar ningún enlace.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablece la contraseña con el token recibido por correo',
    description:
      'El token es de un solo uso y expira a los 30 minutos. Al completarse, se revocan todas las sesiones ' +
      'previas del usuario y se devuelve una sesión nueva (tokens + perfil), igual que /auth/login.',
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: 'Token inválido, ya usado o expirado.' })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<LoginResponseDto> {
    return this.authService.resetPassword(dto.token, dto.newPassword, requestMeta(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoca un refresh token (cierra esa sesión/dispositivo)' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  logout(@Body() dto: RefreshTokenDto): Promise<MessageResponseDto> {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoca todos los refresh tokens del usuario (cierra todas las sesiones)' })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<MessageResponseDto> {
    return this.authService.logoutAll(user.id);
  }
}
