import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '../../shared/gsap';
import { LenisScrollService } from '../../shared/lenis-scroll.service';

/** Called inside a GSAP context; returns cleanup for DOM nodes and listeners. */
export function mountLandingEffects(
  host: HTMLElement,
  options: { global?: boolean; scrollService?: LenisScrollService } = {},
): () => void {
  const cleanups: Array<() => void> = [];
  const desktop = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mobile = matchMedia('(max-width: 767px)').matches;
  const global = options.global ?? true;
  const nodes: HTMLElement[] = [];
  const create = (parent: HTMLElement, className: string) => {
    const node = document.createElement('span');
    node.className = className;
    node.setAttribute('aria-hidden', 'true');
    parent.append(node);
    nodes.push(node);
    return node;
  };

  // Keep touch scrolling native; sync wheel inertia with the existing GSAP clock.
  if (global && desktop) {
    const lenis = new Lenis({
      lerp: 0.1, smoothWheel: true, syncTouch: false, autoRaf: false,
      prevent: node => !!node.closest('input, textarea, select, [role="dialog"], .platform-viewport'),
    });
    const tick = (seconds: number) => lenis.raf(seconds * 1000);
    const unsubscribe = lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tick);
    options.scrollService?.register(lenis);
    cleanups.push(() => {
      gsap.ticker.remove(tick);
      unsubscribe();
      options.scrollService?.unregister(lenis);
      lenis.destroy();
    });
  }

  if (global) {
    const progress = create(host, 'landing-scroll-progress');
    gsap.fromTo(progress, { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: host, start: 'top top', end: 'bottom bottom', scrub: 0.2 },
    });
  }

  // Different heading reveals, replayed in either scrolling direction.
  host.querySelectorAll<HTMLElement>('h2').forEach((heading, index) => {
    if (!heading.getBoundingClientRect().height || heading.closest('.phone-shell')) return;
    const starts = [
      { clipPath: 'inset(0 100% 0 0)', y: 0 },
      { clipPath: 'inset(100% 0 0 0)', y: 16 },
      { clipPath: 'inset(0 0 0 100%)', y: 0 },
    ];
    gsap.fromTo(heading, starts[index % starts.length], {
      clipPath: 'inset(-15% -5% -20% -5%)', y: 0, duration: 1.15,
      ease: 'power3.inOut', immediateRender: false,
      scrollTrigger: { trigger: heading, start: 'top 90%', end: 'bottom top', toggleActions: 'restart none restart none' },
    });
  });

  host.querySelectorAll<HTMLElement>('.security-section, .platforms-showcase, .cta-panel').forEach((section, sectionIndex) => {
    const layer = create(section, 'landing-particles');
    const particles: HTMLElement[] = [];
    for (let index = 0; index < (mobile ? 4 : 12); index++) {
      const dot = create(layer, 'landing-particle');
      dot.style.left = ((index * 37 + sectionIndex * 13) % 96 + 2) + '%';
      dot.style.top = ((index * 23 + 7) % 90 + 5) + '%';
      particles.push(dot);
    }
    const motion = gsap.fromTo(particles, { y: 20, opacity: 0.12, scale: 0.6 }, {
      y: -45, x: index => index % 2 ? 15 : -15, scale: 1.3, opacity: 0.7,
      duration: 3.8, stagger: { each: 0.22, repeat: -1, yoyo: true },
      ease: 'sine.inOut', paused: true,
    });
    ScrollTrigger.create({
      trigger: section, start: 'top bottom', end: 'bottom top',
      onEnter: () => motion.resume(), onEnterBack: () => motion.resume(),
      onLeave: () => motion.pause(), onLeaveBack: () => motion.pause(),
    });
  });

  if (desktop) {
    host.querySelectorAll<HTMLElement>('.security-card, .owner-card, .price-card, .cta-panel').forEach(card => {
      const glow = create(card, 'landing-cursor-glow');
      const xTo = gsap.quickTo(glow, 'x', { duration: 0.45, ease: 'power3.out' });
      const yTo = gsap.quickTo(glow, 'y', { duration: 0.45, ease: 'power3.out' });
      const opacityTo = gsap.quickTo(glow, 'opacity', { duration: 0.35 });
      const move = (event: PointerEvent) => {
        const rect = card.getBoundingClientRect();
        xTo(event.clientX - rect.left);
        yTo(event.clientY - rect.top);
        opacityTo(1);
      };
      const leave = () => opacityTo(0);
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerleave', leave);
        xTo.tween.kill(); yTo.tween.kill(); opacityTo.tween.kill();
      });
    });
  }

  // Fixed-position ring means forms and Angular-owned button contents stay intact.
  const rings = new Set<HTMLElement>();
  const ringTweens = new Set<gsap.core.Tween>();
  const click = (event: MouseEvent) => {
    if (!event.detail || !(event.target instanceof Element)) return;
    const target = event.target.closest('button, a');
    if (!target || target.matches(':disabled')) return;
    const ring = document.createElement('span');
    ring.className = 'landing-click-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = event.clientX + 'px';
    ring.style.top = event.clientY + 'px';
    host.append(ring);
    rings.add(ring);
    const tween = gsap.fromTo(ring, { scale: 0.3, opacity: 0.8 }, {
      scale: 2.1, opacity: 0, duration: 0.65, ease: 'power2.out',
      onComplete: () => { ring.remove(); rings.delete(ring); ringTweens.delete(tween); },
    });
    ringTweens.add(tween);
  };
  if (global) {
    host.addEventListener('click', click);
    cleanups.push(() => {
      host.removeEventListener('click', click);
      ringTweens.forEach(tween => tween.kill());
      rings.forEach(ring => ring.remove());
    });
  }
  return () => { cleanups.forEach(cleanup => cleanup()); nodes.forEach(node => node.remove()); };
}
