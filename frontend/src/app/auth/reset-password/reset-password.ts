import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/auth.service';

/**
 * Pantalla a la que lleva el enlace del correo: se escribe la contraseña nueva y, al guardarla, el backend
 * cierra las sesiones anteriores y devuelve una nueva, así que la persona entra directo a su panel.
 */
@Component({
  imports: [RouterLink],
  selector: 'app-reset-password',
  styleUrl: '../login/login.css',
  templateUrl: './reset-password.html',
})
export class ResetPassword {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  /** El enlace venció, ya se usó o no es válido: hay que pedir otro. */
  protected readonly linkExpired = signal(false);

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  protected onSubmit(event: Event, passwordInput: HTMLInputElement, confirmInput: HTMLInputElement): void {
    event.preventDefault();
    if (this.submitting()) {
      return;
    }
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    this.errorMessage.set(null);
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      this.errorMessage.set('La contraseña debe tener al menos 8 caracteres, con al menos una letra y un número.');
      return;
    }
    if (password !== confirm) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }
    this.submitting.set(true);
    this.authService.resetPassword(this.token, password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl('/panel');
      },
      error: (message: string) => {
        this.submitting.set(false);
        if (/inválido|expir/i.test(message)) {
          this.linkExpired.set(true);
        }
        this.errorMessage.set(message);
      },
    });
  }
}
