import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../shared/auth.service';

/**
 * "¿Olvidaste tu contraseña?": pide el correo y el backend manda un enlace de un solo uso (30 minutos).
 * La respuesta siempre es la misma exista o no la cuenta, para no revelar qué correos están registrados.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-forgot-password',
  styleUrl: '../login/login.css',
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  private readonly authService = inject(AuthService);

  protected readonly submitting = signal(false);
  protected readonly sentTo = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected onSubmit(event: Event, emailInput: HTMLInputElement): void {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sentTo.set(email);
      },
      error: (message: string) => {
        this.submitting.set(false);
        this.errorMessage.set(message);
      },
    });
  }

  protected tryAgain(): void {
    this.sentTo.set(null);
    this.errorMessage.set(null);
  }
}
