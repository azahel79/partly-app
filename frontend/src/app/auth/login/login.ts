import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/auth.service';

@Component({
  imports: [RouterLink],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }

  protected continueWithGoogle(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.authService.continueWithGoogle(returnUrl && returnUrl.startsWith('/') ? returnUrl : undefined);
  }

  protected onSubmit(event: Event, emailInput: HTMLInputElement, passwordInput: HTMLInputElement): void {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.authService.login(email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') ? returnUrl : '/panel');
      },
      error: (message: string) => {
        this.submitting.set(false);
        this.errorMessage.set(message);
      },
    });
  }
}
