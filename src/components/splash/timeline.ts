/**
 * When each part of the opening happens, in ms. Everything up to the formed
 * logo counts from the first frame; each dot varies around these (dots.ts).
 * Everything after counts from the moment the last dot lands, see `moments`.
 */
export const TIMING = {
  // The dots fade in, each at a random moment within `appear`
  appear: 200,
  fadeIn: 200,

  // Then gather into the logo, the first letter from `gatherAt`
  gatherAt: 360,
  gather: 650, // each dot's flight home, give or take 15%
  letterStagger: 120, // between C, J and L
  trace: 260, // a letter's outline arrives in order around it
  fill: 200, // then its inside, from the outline inwards
  taglineStagger: 12, // between the letters of the tagline

  // The formed logo: the real one fades in under the dots
  logoInDelay: 40,
  logoIn: 320,
  shineLead: 120, // the light starts this long before the last dot lands
  shine: 500,
  settle: 180, // before the dots fly off

  // The dots fly off, the logo lifts away, then the app shows
  leave: 550,
  leaveWave: 160, // the outermost dots leave first, the innermost this later
  liftDelay: 250, // into the flight
  lift: 220,
  revealDelay: 120, // after the lift starts
  reveal: 350,

  // Reduced motion, or a tap
  fadeOut: 400,
  reducedMotionHold: 800,
};

/** The moments after the logo is formed, from when its last dot lands. */
export interface Moments {
  formed: number;
  leave: number;
  lift: number;
  reveal: number;
  end: number;
}

export function moments(formed: number): Moments {
  const leave = formed + TIMING.settle;
  const lift = leave + TIMING.liftDelay;
  const reveal = lift + TIMING.revealDelay;
  return {
    formed,
    leave,
    lift,
    reveal,
    end: Math.max(
      reveal + TIMING.reveal,
      leave + TIMING.leaveWave + TIMING.leave,
    ),
  };
}

/**
 * The logo and the overlay at time `t`. The logo appears once the dots have
 * formed it, and lifts away before the app shows, rather than fading over it.
 * `shine` is where the light passing over the formed logo is, across its
 * width from -0.6 to 0.6 (the logo spans -0.5 to 0.5), or null when it isn't.
 */
export function layersAt(t: number, { formed, lift, reveal }: Moments) {
  const lifted = clamp01((t - lift) / TIMING.lift);
  const shineStart = formed - TIMING.shineLead;
  const shined = (t - shineStart) / TIMING.shine;
  return {
    logoOpacity:
      clamp01((t - formed - TIMING.logoInDelay) / TIMING.logoIn) - lifted,
    logoScale: 1 + 0.08 * easeInCubic(lifted),
    overlayOpacity: 1 - clamp01((t - reveal) / TIMING.reveal),
    shine: shined > 0 && shined < 1 ? -0.6 + 1.2 * shined : null,
  };
}

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
