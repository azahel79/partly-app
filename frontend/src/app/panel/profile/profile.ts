import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../shared/auth.service';
import { inspectClabe } from '../../shared/clabe.util';
import { AccountSession, AdminUser, ProfileUpdate, TrustSummary } from '../../shared/users.models';
import { UsersService } from '../../shared/users.service';
import { ConfirmService } from '../../shared/confirm.service';

type ProfileTab = 'profile' | 'security' | 'notifications' | 'trust' | 'payouts' | 'privacy';
type NoticeTone = 'success' | 'error';

interface Notice { tone: NoticeTone; text: string }

@Component({
  selector: 'app-profile',
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  private readonly confirmService = inject(ConfirmService);
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly activeTab = signal<ProfileTab>('profile');
  protected readonly user = signal<AdminUser | null>(null);
  protected readonly summary = signal<TrustSummary | null>(null);
  protected readonly sessions = signal<AccountSession[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly avatarPreview = signal<string | null>(null);
  protected readonly avatarChanged = signal(false);
  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly showPasswords = signal(false);

  protected readonly emailNotifications = signal(true);
  protected readonly inAppNotifications = signal(true);
  protected readonly notifyPayments = signal(true);
  protected readonly notifyGroups = signal(true);
  protected readonly notifyCredentials = signal(true);
  protected readonly notifyPayouts = signal(true);
  protected readonly marketingOptOut = signal(false);
  protected readonly timezone = signal('America/Mexico_City');
  protected readonly profileNameVisible = signal(true);
  protected readonly profileAvatarVisible = signal(true);

  protected readonly payoutHolder = signal('');
  protected readonly payoutBank = signal('');
  protected readonly payoutClabe = signal('');
  protected readonly deletePassword = signal('');
  protected readonly deleteConfirmation = signal('');

  protected readonly clabeInfo = computed(() => inspectClabe(this.payoutClabe()));
  /** True cuando el banco lo dedujo la app a partir de la CLABE (el campo queda bloqueado). */
  protected readonly bankDetected = computed(() => !!this.clabeInfo().bankName);

  protected onClabeInput(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 18);
    this.payoutClabe.set(digits);
    const detected = inspectClabe(digits).bankName;
    if (detected) {
      this.payoutBank.set(detected);
    } else if (digits.length < 3) {
      this.payoutBank.set('');
    }
  }
  protected readonly passwordStrength = computed(() => {
    const password = this.newPassword();
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  });
  protected readonly completion = computed(() => {
    const profile = this.user();
    if (!profile) return 0;
    const checks = [profile.name, profile.emailVerified, profile.phone, profile.avatarUrl, profile.payoutClabeLast4];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  });

  protected readonly tabs: ReadonlyArray<{ id: ProfileTab; icon: string; label: string }> = [
    { id: 'profile', icon: 'person', label: 'Mi perfil' },
    { id: 'security', icon: 'shield_lock', label: 'Seguridad' },
    { id: 'notifications', icon: 'notifications', label: 'Notificaciones' },
    { id: 'trust', icon: 'verified_user', label: 'Confianza' },
    { id: 'payouts', icon: 'account_balance', label: 'Cuenta para cobrar' },
    { id: 'privacy', icon: 'privacy_tip', label: 'Privacidad' },
  ];

  ngOnInit(): void {
    const requestedTab = this.route.snapshot.queryParamMap.get('tab') as ProfileTab | null;
    if (requestedTab && this.tabs.some(tab => tab.id === requestedTab)) this.activeTab.set(requestedTab);
    this.route.queryParamMap.subscribe(params => {
      const tab = params.get('tab') as ProfileTab | null;
      if (tab && this.tabs.some(item => item.id === tab)) this.activeTab.set(tab);
    });
    forkJoin({
      user: this.usersService.getMine(),
      summary: this.usersService.getTrustSummary(),
      sessions: this.usersService.getSessions(),
    }).subscribe({
      next: ({ user, summary, sessions }) => {
        this.applyUser(user);
        this.summary.set(summary);
        this.sessions.set(sessions);
        this.loading.set(false);
      },
      error: (message: string) => {
        this.loading.set(false);
        this.showNotice('error', message);
      },
    });
  }

  protected selectTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
    this.notice.set(null);
  }

  protected initials(): string {
    return (this.user()?.name ?? '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  }

  protected async chooseAvatar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      this.showNotice('error', 'Elige una imagen PNG, JPEG o WebP de máximo 5 MB.');
      input.value = '';
      return;
    }
    try {
      this.avatarPreview.set(await this.resizeAvatar(file));
      this.avatarChanged.set(true);
    } catch {
      this.showNotice('error', 'No pudimos procesar esa imagen. Intenta con otra.');
    }
    input.value = '';
  }

  protected removeAvatar(): void {
    this.avatarPreview.set(null);
    this.avatarChanged.set(true);
  }

  protected saveProfile(): void {
    if (this.name().trim().length < 2) {
      this.showNotice('error', 'Escribe un nombre de al menos 2 caracteres.');
      return;
    }
    const update: ProfileUpdate = { name: this.name().trim(), phone: this.phone().trim() };
    if (this.avatarChanged()) {
      if (this.avatarPreview()) update.avatarUrl = this.avatarPreview()!;
      else update.clearAvatar = true;
    }
    this.save('profile', update, 'Tu información se actualizó correctamente.');
  }

  protected savePassword(): void {
    if (this.user()?.authProvider !== 'LOCAL') {
      this.showNotice('error', 'Esta cuenta usa Google. La contraseña se administra desde Google.');
      return;
    }
    if (this.passwordStrength() < 3) {
      this.showNotice('error', 'Usa al menos 8 caracteres, mayúsculas, minúsculas y números.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.showNotice('error', 'La confirmación de la nueva contraseña no coincide.');
      return;
    }
    this.save('password', {
      currentPassword: this.currentPassword(),
      newPassword: this.newPassword(),
    }, 'Contraseña actualizada. Tu cuenta permanece protegida.', () => {
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
    });
  }

  protected saveNotifications(): void {
    this.save('notifications', {
      emailNotifications: this.emailNotifications(),
      inAppNotifications: this.inAppNotifications(),
      notifyPayments: this.notifyPayments(),
      notifyGroups: this.notifyGroups(),
      notifyCredentials: this.notifyCredentials(),
      notifyPayouts: this.notifyPayouts(),
      marketingOptOut: this.marketingOptOut(),
      timezone: this.timezone(),
    }, 'Tus preferencias de notificación quedaron guardadas.');
  }

  protected savePrivacy(): void {
    this.save('privacy', {
      profileNameVisible: this.profileNameVisible(),
      profileAvatarVisible: this.profileAvatarVisible(),
    }, 'Tus preferencias de privacidad quedaron guardadas.');
  }

  protected savePayoutAccount(): void {
    const info = this.clabeInfo();
    if (!this.payoutHolder().trim() || !this.payoutBank().trim() || !info.isValid) {
      this.showNotice('error', 'Completa el titular, banco y una CLABE válida de 18 dígitos.');
      return;
    }
    this.save('payouts', {
      payoutAccountHolder: this.payoutHolder().trim(),
      payoutBankName: this.payoutBank().trim(),
      payoutClabe: info.digits,
    }, 'Cuenta para recibir pagos guardada de forma cifrada.', () => this.payoutClabe.set(''));
  }

  protected async clearPayoutAccount(): Promise<void> {
    const ok = await this.confirmService.ask({ title: '¿Eliminar la cuenta para recibir pagos?', text: 'Tus compradores no verán a dónde transferirte hasta que la guardes de nuevo.', confirmText: 'Sí, eliminar', danger: true });
    if (!ok) return;
    this.save('payouts', { clearPayoutAccount: true }, 'La cuenta para recibir pagos fue eliminada.');
  }

  protected revokeSession(session: AccountSession): void {
    this.saving.set(`session-${session.id}`);
    this.usersService.revokeSession(session.id).subscribe({
      next: () => {
        this.sessions.update(list => (list ?? []).filter(item => item.id !== session.id));
        this.saving.set(null);
        this.showNotice('success', 'Sesión cerrada correctamente.');
      },
      error: (message: string) => { this.saving.set(null); this.showNotice('error', message); },
    });
  }

  protected async logoutEverywhere(): Promise<void> {
    const ok = await this.confirmService.ask({ title: '¿Cerrar todas las sesiones?', text: 'Tendrás que volver a iniciar sesión en todos tus dispositivos.', confirmText: 'Sí, cerrar todas', danger: true });
    if (!ok) return;
    this.saving.set('logout-all');
    this.authService.logoutAll().subscribe({
      next: () => this.router.navigateByUrl('/iniciar-sesion'),
      error: (message: string) => { this.saving.set(null); this.showNotice('error', message); },
    });
  }

  protected exportData(): void {
    this.saving.set('export');
    this.usersService.exportMine().subscribe({
      next: data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `partly-datos-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        this.saving.set(null);
        this.showNotice('success', 'Tu archivo se descargó correctamente.');
      },
      error: (message: string) => { this.saving.set(null); this.showNotice('error', message); },
    });
  }

  protected async deleteAccount(): Promise<void> {
    if (this.deleteConfirmation() !== 'ELIMINAR') {
      this.showNotice('error', 'Escribe ELIMINAR para confirmar.');
      return;
    }
    const ok = await this.confirmService.ask({ title: '¿Eliminar tu cuenta?', text: 'Esta acción anonimizará tu cuenta y cerrará todas tus sesiones. No se puede deshacer.', confirmText: 'Sí, eliminar mi cuenta', danger: true });
    if (!ok) return;
    this.saving.set('delete');
    this.usersService.cancelMine(this.deletePassword() || undefined).subscribe({
      next: () => {
        this.authService.clearSession();
        this.router.navigateByUrl('/');
      },
      error: (message: string) => { this.saving.set(null); this.showNotice('error', message); },
    });
  }

  protected formatDate(date: string): string {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
  }

  protected deviceName(userAgent: string | null): string {
    if (!userAgent) return 'Dispositivo desconocido';
    const browser = userAgent.includes('Edg/') ? 'Edge' : userAgent.includes('Chrome/') ? 'Chrome' : userAgent.includes('Firefox/') ? 'Firefox' : userAgent.includes('Safari/') ? 'Safari' : 'Navegador';
    const os = userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Android') ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : userAgent.includes('Mac OS') ? 'macOS' : 'otro sistema';
    return `${browser} en ${os}`;
  }

  private save(key: string, update: ProfileUpdate, success: string, after?: () => void): void {
    if (this.saving()) return;
    this.saving.set(key);
    this.notice.set(null);
    this.usersService.updateMine(update).subscribe({
      next: user => {
        this.applyUser(user);
        this.authService.updateCurrentUser(user);
        this.saving.set(null);
        this.showNotice('success', success);
        after?.();
      },
      error: (message: string) => { this.saving.set(null); this.showNotice('error', message); },
    });
  }

  private applyUser(user: AdminUser): void {
    this.user.set(user);
    this.name.set(user.name);
    this.phone.set(user.phone ?? '');
    this.avatarPreview.set(user.avatarUrl);
    this.avatarChanged.set(false);
    this.emailNotifications.set(user.emailNotifications ?? true);
    this.inAppNotifications.set(user.inAppNotifications ?? true);
    this.notifyPayments.set(user.notifyPayments ?? true);
    this.notifyGroups.set(user.notifyGroups ?? true);
    this.notifyCredentials.set(user.notifyCredentials ?? true);
    this.notifyPayouts.set(user.notifyPayouts ?? true);
    this.marketingOptOut.set(user.marketingOptOut ?? false);
    this.timezone.set(user.timezone ?? 'America/Mexico_City');
    this.profileNameVisible.set(user.profileNameVisible ?? true);
    this.profileAvatarVisible.set(user.profileAvatarVisible ?? true);
    this.payoutHolder.set(user.payoutAccountHolder ?? '');
    this.payoutBank.set(user.payoutBankName ?? '');
  }

  private showNotice(tone: NoticeTone, text: string): void {
    this.notice.set({ tone, text });
    window.setTimeout(() => this.notice.update(current => current?.text === text ? null : current), 4500);
  }

  private resizeAvatar(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext('2d');
          if (!context) return reject(new Error('Canvas no disponible'));
          const crop = Math.min(image.width, image.height);
          const sx = (image.width - crop) / 2;
          const sy = (image.height - crop) / 2;
          context.drawImage(image, sx, sy, crop, crop, 0, 0, size, size);
          resolve(canvas.toDataURL('image/webp', 0.82));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }
}
