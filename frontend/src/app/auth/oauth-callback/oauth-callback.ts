import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, OAUTH_RETURN_URL_KEY } from '../../shared/auth.service';

@Component({
  imports: [RouterLink],
  selector: 'app-oauth-callback',
  styleUrl: './oauth-callback.css',
  templateUrl: './oauth-callback.html',
})
export class OauthCallback implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      this.errorMessage.set('Falta el código de Google. Intenta iniciar sesión de nuevo.');
      return;
    }

    this.authService.exchangeGoogleCode(code).subscribe({
      next: () => {
        const returnUrl = sessionStorage.getItem(OAUTH_RETURN_URL_KEY);
        sessionStorage.removeItem(OAUTH_RETURN_URL_KEY);
        this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') ? returnUrl : '/panel');
      },
      error: (message: string) => this.errorMessage.set(message),
    });
  }
}
