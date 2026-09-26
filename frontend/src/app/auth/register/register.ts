import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/auth.service';

@Component({
  imports: [RouterLink],
  selector: 'app-register',
  styleUrl: './register.css',
  templateUrl: './register.html',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  protected continueWithGoogle(): void {
    this.authService.continueWithGoogle();
  }

  protected onSubmit(
    event: Event,
    nameInput: HTMLInputElement,
    emailInput: HTMLInputElement,
    passwordInput: HTMLInputElement,
    termsInput: HTMLInputElement,
  ): void {
    event.preventDefault();
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!name || !email || !password || !termsInput.checked || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.authService.register(name, email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl('/panel');
      },
      error: (message: string) => {
        this.submitting.set(false);
        this.errorMessage.set(message);
      },
    });
  }
}
