import { Component, inject, signal } from '@angular/core';
import { ParallaxDirective } from '../../../shared/parallax.directive';
import { MagneticDirective } from '../../../shared/magnetic.directive';
import { WaitlistService } from '../../../shared/waitlist.service';

@Component({
  imports: [ParallaxDirective, MagneticDirective],
  selector: 'app-hero',
  styleUrl: './hero.css',
  templateUrl: './hero.html',
})
export class Hero {
  private readonly waitlist = inject(WaitlistService);

  protected readonly submitState = signal<'idle' | 'submitting' | 'success' | 'error'>('idle');

  protected async onSubmit(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const email = input.value.trim();
    if (!email || this.submitState() === 'submitting') {
      return;
    }

    this.submitState.set('submitting');
    const ok = await this.waitlist.submit(email, 'hero');
    if (ok) {
      input.value = '';
      this.submitState.set('success');
    } else {
      this.submitState.set('error');
    }
  }
}
