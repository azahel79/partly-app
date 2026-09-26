import { Component, Input } from '@angular/core';

/**
 * A getwaves.io-style section divider: a bar in the PREVIOUS section's color
 * with a wave shape in the NEXT section's color rising from its bottom edge,
 * so the boundary between two differently-colored sections reads as a
 * smooth curve instead of a hard rectangular seam. The wave drifts
 * continuously (paused under prefers-reduced-motion, see styles.css).
 */
@Component({
  selector: 'app-wave-divider',
  standalone: true,
  host: { style: 'display: block' },
  template: `
    <div class="relative w-full overflow-hidden leading-none -my-px" [style.background-color]="backColor" [style.height.px]="height">
      <svg class="wave-drift block h-full" viewBox="0 0 2400 120" preserveAspectRatio="none">
        <path
          d="M0,60 C150,10 450,110 600,60 C750,10 1050,110 1200,60 C1350,10 1650,110 1800,60 C1950,10 2250,110 2400,60 L2400,120 L0,120 Z"
          [attr.fill]="waveColor"
        ></path>
      </svg>
    </div>
  `,
})
export class WaveDivider {
  /** Background of the bar itself — should match the PREVIOUS section's color. */
  @Input() backColor = '#F6F4EF';
  /** Fill of the wave shape — should match the NEXT section's color. */
  @Input() waveColor = '#EBE8DF';
  @Input() height = 90;
}
