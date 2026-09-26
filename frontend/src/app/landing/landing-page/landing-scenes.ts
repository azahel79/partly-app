import { gsap, ScrollTrigger } from '../../shared/gsap';

interface SceneBeat {
  selector: string;
  from: gsap.TweenVars;
  to?: gsap.TweenVars;
  at?: gsap.Position;
}

/** Inner illustrations only: reveal/tilt directives retain control of their hosts. */
export function mountLandingScenes(
  host: HTMLElement,
  runtime: { gsap: any; ScrollTrigger: any } = { gsap, ScrollTrigger },
): () => void {
  const { gsap, ScrollTrigger } = runtime;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const compact = matchMedia('(max-width: 767px)').matches;
  const decorations: HTMLElement[] = [];
  const loops = new Map<gsap.core.Animation, boolean>();
  const sceneRoots = new Map<HTMLElement, boolean>();
  const select = (root: Element, selector: string) =>
    Array.from(root.querySelectorAll<HTMLElement>(selector));

  const sequence = (selector: string, beats: SceneBeat[]) => {
    select(host, selector).forEach(root => {
      const timeline = gsap.timeline({
        defaults: { duration: 0.8, ease: 'power3.out', immediateRender: false },
        scrollTrigger: {
          trigger: root, start: 'top 88%', end: 'bottom top',
          toggleActions: 'restart none restart none',
        },
      });
      beats.forEach(beat => {
        const targets = select(root, beat.selector);
        if (!targets.length) return;
        timeline.fromTo(targets, beat.from, {
          opacity: 1, x: 0, y: 0, scale: 1, rotationX: 0,
          stagger: 0.09, ...beat.to,
        }, beat.at);
      });
    });
  };

  const loopInView = (root: HTMLElement, animation: gsap.core.Animation) => {
    animation.pause();
    loops.set(animation, false);
    const update = (trigger: ScrollTrigger) => {
      loops.set(animation, trigger.isActive);
      animation.paused(!trigger.isActive || document.hidden);
    };
    ScrollTrigger.create({
      trigger: root, start: 'top bottom', end: 'bottom top',
      onToggle: update, onRefresh: update,
    });
  };

  const decorate = (root: HTMLElement, className: string) => {
    const element = document.createElement('span');
    element.className = className;
    element.setAttribute('aria-hidden', 'true');
    root.append(element);
    decorations.push(element);
    return element;
  };

  // The phone assembles from the inside, then gently tilts with the scroll.
  sequence('.hero-inner', [
    { selector: '.hero-description, .hero-form, .hero-benefits > div', from: { opacity: 0, y: 24 }, at: 0.15 },
    { selector: '.phone-brand, .phone-greeting, .phone-tabs', from: { opacity: 0, y: 18 }, at: 0.2 },
    { selector: '.subscription-list > article', from: { opacity: 0, x: 44, scale: 0.9 }, to: { stagger: 0.15, ease: 'back.out(1.4)' }, at: 0.45 },
    { selector: '.float-card > *', from: { opacity: 0, y: 16, scale: 0.8 }, at: 0.75 },
    { selector: '.phone-nav > *', from: { opacity: 0, y: 12 }, at: 1 },
  ]);
  const phone = host.querySelector<HTMLElement>('.phone-shell');
  if (phone) gsap.fromTo(phone, { y: 0, rotation: 3 }, {
    y: compact ? -12 : -48, rotation: compact ? 1 : -4, ease: 'none',
    scrollTrigger: { trigger: phone.closest('.landing-hero')!, start: 'top top', end: 'bottom top', scrub: 1.3 },
  });
  sequence('.platform-strip', [
    { selector: '.brand-list > *', from: { opacity: 0, y: 28, rotationX: -45 }, to: { stagger: 0.1 } },
    { selector: '.community > div > *', from: { opacity: 0, x: -16, scale: 0.6 }, at: 0.25 },
  ]);

  // Prices remain real text; only chart geometry animates, not the amounts.
  sequence('.comparison-card', [
    { selector: '.bar.individual', from: { scaleY: 0, transformOrigin: 'center bottom' }, to: { scaleY: 1, duration: 1.2, stagger: 0.12 }, at: 0.1 },
    { selector: '.bar.partly', from: { scaleY: 0, transformOrigin: 'center bottom' }, to: { scaleY: 1, duration: 1, stagger: 0.12, ease: 'back.out(1.4)' }, at: 0.45 },
    { selector: '.bar b, .bar > span', from: { opacity: 0, y: 8 }, at: 0.85 },
    { selector: '.partly-price > *', from: { opacity: 0, y: 18 }, at: 0.55 },
  ]);
  sequence('.grace-payment-card', [
    { selector: '.plan-features > span', from: { opacity: 0, x: -16 }, at: 0.1 },
    { selector: '.grace-countdown > div', from: { opacity: 0, y: 22, scale: 0.9 }, at: 0.25 },
    { selector: '.active-notice, .confirm-payment, .shield-caption', from: { opacity: 0, y: 18 }, at: 0.5 },
  ]);
  sequence('.calendar-card', [
    { selector: '.calendar-weekdays > span', from: { opacity: 0, y: -12 }, to: { stagger: 0.035 }, at: 0 },
    { selector: '.calendar-grid > span', from: { opacity: 0, y: 18, scale: 0.72 }, to: { stagger: { grid: [6, 7], from: 'start', amount: 0.65 }, duration: 0.65, ease: 'back.out(1.35)' }, at: 0.15 },
    { selector: '.next-charge', from: { opacity: 0, y: 24 }, at: 0.9 },
  ]);
  sequence('.price-card', [
    { selector: '.price-line > *', from: { opacity: 0, y: 28, rotationX: -35 }, at: 0.2 },
  ]);
  sequence('.comparison-summary', [
    { selector: 'article > span', from: { opacity: 0, scale: 0.45 }, to: { ease: 'back.out(1.8)' }, at: 0.1 },
    { selector: 'article > div > i > b', from: { scaleX: 0, transformOrigin: 'left center' }, to: { scaleX: 1, duration: 1.3, stagger: 0.25 }, at: 0.35 },
  ]);

  // A travelling accent links the four steps without shifting their layout.
  select(host, '.process-grid').forEach(grid => {
    const cards = select(grid, '.process-card');
    const flow = gsap.timeline({ repeat: -1, repeatDelay: 1.8, paused: true });
    cards.forEach((card, index) => {
      const highlight = decorate(card, 'landing-step-highlight');
      flow.fromTo(highlight, { opacity: 0 }, { opacity: 1, duration: 0.55 }, index * 1.2)
        .to(highlight, { opacity: 0, duration: 0.8 }, index * 1.2 + 0.8);
    });
    loopInView(grid, flow);
  });
  sequence('.process-grid', [
    { selector: '.connector', from: { opacity: 0, scaleX: 0, transformOrigin: 'left center' }, to: { stagger: 0.3 }, at: 0.4 },
  ]);
  sequence('.process-card', [
    { selector: 'h3, p', from: { opacity: 0, y: 18 }, at: 0.25 },
    { selector: '.step-arrow', from: { opacity: 0, x: -18, scale: 0.5 }, to: { ease: 'back.out(1.8)' }, at: 0.55 },
  ]);

  // Radar rings and a slow scan give the security illustration its own language.
  select(host, '.shield-visual').forEach(shield => {
    const rings = [0, 1].map(() => decorate(shield, 'landing-radar-ring'));
    loopInView(shield, gsap.fromTo(rings, { scale: 0.62, opacity: 0 }, {
      keyframes: [{ opacity: 0.55, duration: 0.7 }, { scale: 1.5, opacity: 0, duration: 3.3 }],
      stagger: { each: 2, repeat: -1 }, ease: 'sine.out', paused: true,
    }));
  });
  select(host, '.credentials-visual, .platform-art').forEach(root => {
    const window = decorate(root, 'landing-scan-window');
    const sheen = decorate(window, 'landing-scan-light');
    loopInView(root, gsap.fromTo(sheen, { xPercent: -140 }, {
      xPercent: 420, duration: 2.8, ease: 'power1.inOut', repeat: -1,
      repeatDelay: 5, paused: true,
    }));
  });
  sequence('.security-card', [
    { selector: ':scope > b', from: { opacity: 0, y: -20 }, to: { duration: 1 }, at: 0.3 },
  ]);

  select(host, '.platforms-showcase, .security-section, .cta-panel').forEach(root => {
    const window = decorate(root, 'landing-aurora-window');
    const aurora = decorate(window, 'landing-aurora');
    loopInView(root, gsap.fromTo(aurora, { xPercent: -10, rotation: -6, scale: 1.05 }, {
      xPercent: 10, rotation: 6, scale: compact ? 1.1 : 1.25,
      duration: 12, ease: 'sine.inOut', repeat: -1, yoyo: true, paused: true,
    }));
  });

  // Calculator and wallet reveal independently, with no changes to their signals.
  sequence('.owner-card', [
    { selector: ':scope > header > span', from: { opacity: 0, scale: 0.35 }, to: { ease: 'back.out(1.8)' }, at: 0.15 },
    { selector: '.balance > div, .earning-box > div', from: { opacity: 0, y: 24 }, at: 0.4 },
    { selector: '.balance > button, .free-copy, :scope > ul > li', from: { opacity: 0, y: 18 }, at: 0.65 },
  ]);
  sequence('.story-card', [
    { selector: ':scope > header > i', from: { opacity: 0, scale: 0.45 }, to: { ease: 'back.out(1.8)' }, at: 0.15 },
    { selector: ':scope > header h3, :scope > header small, :scope > mark', from: { opacity: 0, x: 20 }, at: 0.3 },
  ]);
  sequence('.cta-content', [
    { selector: ':scope > p', from: { opacity: 0, y: 24 }, at: 0.2 },
    { selector: ':scope > form', from: { opacity: 0, y: 36, scale: 0.94 }, to: { duration: 1.1, ease: 'back.out(1.2)' }, at: 0.4 },
    { selector: ':scope > .safe', from: { opacity: 0, y: 16 }, at: 0.7 },
  ]);

  // Hand-drawn arrows trace themselves on every visit.
  host.querySelectorAll<SVGPathElement>('.hand-arrow path, .time-note svg path').forEach(path => {
    const length = path.getTotalLength();
    gsap.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, {
      strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', immediateRender: false,
      scrollTrigger: { trigger: path.closest('svg')!, start: 'top 90%', end: 'bottom top', toggleActions: 'restart none restart none' },
    });
  });

  // CSS loops are dormant offscreen and while the tab is in the background.
  select(host, '.landing-hero, .results-showcase, .grace-showcase, .calendar-showcase, .process-section, .comparison-section, .platforms-showcase, .security-section, .owners-section, .testimonials-section, .cta-panel, app-wave-divider, .landing-motion-wave, app-footer')
    .forEach(root => {
      root.classList.add('landing-scene-scope');
      const update = (trigger: ScrollTrigger) => {
        sceneRoots.set(root, trigger.isActive);
        root.classList.toggle('landing-scene-visible', trigger.isActive && !document.hidden);
      };
      ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: update, onRefresh: update });
    });
  const visibility = () => {
    loops.forEach((active, animation) => animation.paused(!active || document.hidden));
    sceneRoots.forEach((active, root) => root.classList.toggle('landing-scene-visible', active && !document.hidden));
  };
  document.addEventListener('visibilitychange', visibility);

  return () => {
    document.removeEventListener('visibilitychange', visibility);
    sceneRoots.forEach((_, root) => root.classList.remove('landing-scene-visible', 'landing-scene-scope'));
    decorations.forEach(node => node.remove());
  };
}
