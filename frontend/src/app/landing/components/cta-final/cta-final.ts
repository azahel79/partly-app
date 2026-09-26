import { Component, inject, signal } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { MagneticDirective } from '../../../shared/magnetic.directive';
import { WaitlistService } from '../../../shared/waitlist.service';

@Component({
  imports: [RevealDirective, MagneticDirective],
  selector: 'app-cta-final',
  styleUrl: './cta-final.css',
  templateUrl: './cta-final.html',
})
export class CtaFinal {
  private readonly waitlist = inject(WaitlistService);

  protected readonly submitState = signal<'idle' | 'submitting' | 'success' | 'error'>('idle');

  protected async onSubmit(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const email = input.value.trim();
    if (!email || this.submitState() === 'submitting') {
      return;
    }

    this.submitState.set('submitting');
    const ok = await this.waitlist.submit(email, 'cta-final');
    if (ok) {
      input.value = '';
      this.submitState.set('success');
    } else {
      this.submitState.set('error');
    }
  }
}
