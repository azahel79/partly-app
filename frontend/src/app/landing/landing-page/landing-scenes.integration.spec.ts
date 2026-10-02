import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

describe('landing scenes with the GSAP runtime', () => {
  let runtime: typeof import('../../shared/gsap');
  let mount: typeof import('./landing-scenes').mountLandingScenes;
  let dispose: (() => void) | undefined;
  let host: HTMLElement;

  beforeAll(async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    }));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    runtime = await import('../../shared/gsap');
    ({ mountLandingScenes: mount } = await import('./landing-scenes'));
  });

  afterEach(() => {
    dispose?.();
    host?.remove();
  });

  afterAll(() => {
    runtime.ScrollTrigger.disable();
    runtime.gsap.ticker.sleep();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('can finish entrances and revert without leaving triggers or inline styles', () => {
    host = document.createElement('main');
    host.innerHTML = `
      <section class="landing-hero"><div class="hero-inner"><p class="hero-description">Tequio</p>
        <div class="phone-shell"><div class="subscription-list"><article>Netflix</article></div></div>
      </div></section>
      <section class="comparison-card"><div class="bar individual"><b>$219</b></div><div class="bar partly"><b>$49</b></div></section>
      <section class="process-section"><div class="process-grid"><article class="process-card"><h3>Explora</h3><p>Elige tu grupo</p></article></div></section>
      <section class="security-section"><div class="shield-visual"></div></section>
      <section class="platforms-showcase"><div class="platform-art">Disney+</div></section>
      <section class="cta-panel"><div class="cta-content"><form><input type="email" /></form></div></section>`;
    document.body.append(host);
    const initialTriggers = runtime.ScrollTrigger.getAll().length;
    let cleanup: () => void;
    const context = runtime.gsap.context(() => { cleanup = mount(host); }, host);
    dispose = () => { context.revert(); cleanup(); };

    const triggers = runtime.ScrollTrigger.getAll().slice(initialTriggers);
    expect(triggers.length).toBeGreaterThan(10);
    triggers.forEach(trigger => trigger.animation?.progress(1));
    const description = host.querySelector<HTMLElement>('.hero-description')!;
    expect(Number(description.style.opacity)).toBe(1);
    const bar = host.querySelector<HTMLElement>('.bar.individual')!;
    expect(Number(runtime.gsap.getProperty(bar, 'scaleY'))).toBe(1);
    expect(host.innerHTML).not.toContain('NaN');

    dispose();
    dispose = undefined;
    expect(runtime.ScrollTrigger.getAll().length).toBe(initialTriggers);
    expect(description.style.opacity).toBe('');
    expect(bar.style.transform).toBe('');
    expect(host.querySelector('[aria-hidden]')).toBeNull();
  });
});
