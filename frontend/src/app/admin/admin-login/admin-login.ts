import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/auth.service';

const DEFAULT_ADMIN_URL = '/admin';

@Component({
  imports: [RouterLink],
  selector: 'app-admin-login',
  styleUrl: './admin-login.css',
  templateUrl: './admin-login.html',
})
export class AdminLogin implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notAdmin = signal(false);

  private get returnUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    return raw && raw.startsWith('/') ? raw : DEFAULT_ADMIN_URL;
  }

  ngOnInit(): void {
    // Si ya hay sesión de admin, no tiene caso mostrarle el formulario de nuevo.
    if (this.authService.isAdmin()) {
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((visible) => !visible);
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
    this.notAdmin.set(false);
    this.authService.login(email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        if (this.authService.isAdmin()) {
          this.router.navigateByUrl(this.returnUrl);
        } else {
          // Cuenta válida pero sin rol ADMIN — se queda logueada, solo no entra aquí.
          this.notAdmin.set(true);
        }
      },
      error: (message: string) => {
        this.submitting.set(false);
        this.errorMessage.set(message);
      },
    });
  }
}
