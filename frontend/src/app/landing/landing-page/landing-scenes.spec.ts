import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      }),
    });
  }
});

import { mountLandingScenes } from './landing-scenes';

const motion = vi.hoisted(() => {
  const animations: Array<{
    pause: ReturnType<typeof vi.fn>;
    paused: ReturnType<typeof vi.fn>;
    fromTo: ReturnType<typeof vi.fn>;
    to: ReturnType<typeof vi.fn>;
  }> = [];
  const animation = (..._args: any[]) => {
    const value = {
      pause: vi.fn().mockReturnThis(), paused: vi.fn().mockReturnThis(),
      fromTo: vi.fn().mockReturnThis(), to: vi.fn().mockReturnThis(),
    };
    animations.push(value);
    return value;
  };
  return { animations, timeline: vi.fn(animation), fromTo: vi.fn(animation), create: vi.fn() };
});

const runtime = {
  gsap: { timeline: motion.timeline, fromTo: motion.fromTo },
  ScrollTrigger: { create: motion.create },
};

describe('landing scene motion', () => {
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  const media = (reduced = false, compact = false) => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('reduce)') ? reduced : compact,
    })));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    motion.animations.length = 0;
    media();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    host = document.createElement('main');
    host.innerHTML = `
      <section class="landing-hero"><div class="hero-inner">
        <div class="hero-description">Contenido legible</div><form class="hero-form"><input type="email" /></form>
        <div class="phone-shell"><div class="subscription-list"><article>Netflix</article><article>Spotify</article></div></div>
      </div></section>
      <section class="process-section"><div class="process-grid">
        <article class="process-card"><h3>Paso uno</h3><p>Explora</p></article>
        <article class="process-card"><h3>Paso dos</h3><p>Comparte</p></article>
        <article class="process-card"><h3>Paso tres</h3></article>
        <article class="process-card"><h3>Paso cuatro</h3></article>
        <span class="connector">→</span>
      </div></section>
      <section class="calendar-showcase"><div class="calendar-card"><div class="calendar-grid">
        ${Array.from({ length: 42 }, (_, i) => `<span>${i + 1}</span>`).join('')}
      </div><div class="next-charge">Pago de ejemplo</div></div></section>
      <section class="security-section"><div class="shield-visual"></div></section>
      <section class="platforms-showcase"><div class="platform-art">Disney+</div></section>
      <section class="cta-panel"><div class="cta-content"><form><input type="email" /></form></div></section>`;
    document.body.append(host);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not mount effects when reduced motion is requested', () => {
    media(true);
    const original = host.innerHTML;
    cleanup = mountLandingScenes(host, runtime);
    expect(host.innerHTML).toBe(original);
    expect(motion.timeline).not.toHaveBeenCalled();
    expect(motion.create).not.toHaveBeenCalled();
  });

  it('replays scene entrances in both scroll directions without immediate hiding', () => {
    cleanup = mountLandingScenes(host, runtime);
    const configs = motion.timeline.mock.calls.map(args => args[0]);
    const entrances = configs.filter(config => config?.scrollTrigger);
    expect(entrances.length).toBeGreaterThan(4);
    entrances.forEach(config => {
      expect(config.scrollTrigger.toggleActions).toBe('restart none restart none');
      expect(config.defaults.immediateRender).toBe(false);
      expect(host.contains(config.scrollTrigger.trigger)).toBe(true);
    });
  });

  it('animates all 42 calendar cells without changing displayed information or forms', () => {
    const originalText = host.textContent;
    const inputs = Array.from(host.querySelectorAll('input'));
    cleanup = mountLandingScenes(host, runtime);
    const beats = motion.animations.flatMap(animation => animation.fromTo.mock.calls);
    const calendar = beats.find(args => args[0].length === 42);
    expect(calendar).toBeDefined();
    expect(calendar?.[2].stagger.grid).toEqual([6, 7]);
    expect(host.textContent).toBe(originalText);
    expect(Array.from(host.querySelectorAll('input'))).toEqual(inputs);
  });

  it('pauses repeating scenes offscreen and when the document is hidden', () => {
    cleanup = mountLandingScenes(host, runtime);
    const flow = motion.animations.find(animation => animation.fromTo.mock.calls.length === 4)!;
    expect(flow.pause).toHaveBeenCalled();
    const flowTrigger = motion.create.mock.calls.map(args => args[0])
      .find(config => config.trigger === host.querySelector('.process-grid'));
    flowTrigger.onToggle({ isActive: true });
    expect(flow.paused).toHaveBeenLastCalledWith(false);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flow.paused).toHaveBeenLastCalledWith(true);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flow.paused).toHaveBeenLastCalledWith(false);
    flowTrigger.onToggle({ isActive: false });
    expect(flow.paused).toHaveBeenLastCalledWith(true);
  });

  it('removes decorative nodes, visibility classes and listeners on route teardown', () => {
    const original = host.innerHTML;
    cleanup = mountLandingScenes(host, runtime);
    const nodes = host.querySelectorAll('[aria-hidden="true"]');
    expect(nodes.length).toBeGreaterThan(8);
    nodes.forEach(node => expect(node.hasAttribute('tabindex')).toBe(false));
    motion.create.mock.calls.forEach(args => args[0].onToggle({ isActive: true }));
    expect(host.querySelector('.landing-scene-visible')).not.toBeNull();
    cleanup();
    cleanup = undefined;
    motion.animations.forEach(animation => animation.paused.mockClear());
    document.dispatchEvent(new Event('visibilitychange'));
    motion.animations.forEach(animation => expect(animation.paused).not.toHaveBeenCalled());
    expect(host.innerHTML).toBe(original);
  });

  it('keeps the phone screen inside its frame and uses smaller travel on mobile', () => {
    media(false, true);
    cleanup = mountLandingScenes(host, runtime);
    const phone = motion.fromTo.mock.calls.find(args => args[0] === host.querySelector('.phone-shell'));
    expect(phone?.[2].y).toBe(-12);
    expect(phone?.[2].rotation).toBe(1);
    expect(motion.fromTo.mock.calls.some(args => args[0]?.classList?.contains('phone-screen'))).toBe(false);
  });
});
