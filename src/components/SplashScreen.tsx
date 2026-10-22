import { useEffect, useRef, useState } from "react";

/**
 * The installed app's opening. It starts on an explosion: dots burst from the
 * middle of the screen and slow to a drifting cloud, then come back letter by
 * letter (each outline first, then its inside) to form the logo. The real
 * logo appears under them, and the dots fly off as the app appears.
 *
 * The script in _document.tsx marks a launch with data-splash on <html>
 * before the first paint, so the overlay covers the page from the first
 * frame (globals.css). Anywhere else the overlay stays hidden, and goes once
 * mounted. A tap skips it; with reduced motion the logo just fades in and out.
 */

// The dots are drawn on one canvas, from typed arrays: no element or React
// render per dot, and positions are worked out from the time alone, so a
// dropped frame never knocks the choreography out of step.

// Timeline, in ms from the first frame
const BURST_MS = 1000; // out from the middle, slowing to a float
const GATHER_AT = 950;
const GATHER_MS = 800;
const LETTER_STAGGER = 160; // between C, J and L
const TRACE_MS = 320; // dots of an outline arrive in order around it
const FILL_MS = 260; // then the inside fills in, from the outline inwards
const TAGLINE_STAGGER = 18; // between the letters of the tagline
const SETTLE_MS = 250; // the formed logo, before the dots fly off
const LEAVE_MS = 650;
const REVEAL_DELAY = 350; // into the flight, the logo lifts away
const LOGO_OUT_MS = 260;
const REVEAL_MS = 450; // then the app shows
const FADE_MS = 400; // reduced motion, or a tap

// Same color as the launch images and the manifest's background_color
const BACKGROUND = "#111827";

interface Particles {
  count: number;
  /** Home, relative to the logo's center, in CSS px at the sampled size. */
  homeX: Float32Array;
  homeY: Float32Array;
  homeRadius: Float32Array;
  homeAngle: Float32Array;
  /** Where the dot bursts from, near the middle. */
  burstX: Float32Array;
  burstY: Float32Array;
  /** Where the dot flies out to, relative to the logo's center. */
  outX: Float32Array;
  outY: Float32Array;
  /** Its own pace around the logo while out, in radians per ms. */
  drift: Float32Array;
  /** How far its paths out and back bow to one side, and which side. */
  bendOut: Float32Array;
  bendBack: Float32Array;
  /** Its wobble in flight: size, speeds and phases. */
  wobble: Float32Array;
  wobbleSpeed: Float32Array;
  phase: Float32Array;
  scatterStart: Float32Array;
  scatterEnd: Float32Array;
  gatherStart: Float32Array;
  gatherEnd: Float32Array;
  leaveDelay: Float32Array;
  leaveDistance: Float32Array;
  size: Float32Array;
  /** Dots of each color, so a frame needs one fill per color. */
  buckets: { color: string; indices: Uint16Array }[];
  logoWidth: number;
  /** When the last dot is home. */
  formedAt: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeInCubic = (t: number) => t * t * t;
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

/** Runs of [start, end) where `filled` holds, between `from` and `to`. */
function runs(from: number, to: number, filled: (i: number) => boolean) {
  const result: [number, number][] = [];
  let start = -1;
  for (let i = from; i <= to; i++) {
    const inside = i < to && filled(i);
    if (inside && start < 0) start = i;
    if (!inside && start >= 0) {
      result.push([start, i]);
      start = -1;
    }
  }
  return result;
}

/**
 * Places the dots on the logo's own pixels, at the size it is shown: a hex
 * grid over each letter, each dot in the color under it. The letters are told
 * apart by the gaps between them, and the tagline by the gap above it, so the
 * dots of each one arrive together.
 */
function sampleLogo(
  image: HTMLImageElement,
  width: number,
  height: number,
  viewport: { width: number; height: number },
): Particles {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);

  const alpha = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h
      ? 0
      : data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3];
  const solid = (x: number, y: number) => alpha(x, y) > 140;
  const rowFilled = (y: number) => {
    for (let x = 0; x < w; x++) if (solid(x, y)) return true;
    return false;
  };

  // The letters, then the tagline under them
  const bands = runs(0, h, rowFilled);
  const letters = bands[0] ?? [0, h];
  const tagline = bands.length > 1 ? [bands[1][0], bands.at(-1)![1]] : null;

  // About the same number of dots on any screen: the grid scales with the logo
  const gap = Math.max(2.2, width / 75);
  const groups: {
    top: number;
    bottom: number;
    columns: [number, number][];
    spacing: number;
    radius: number;
    tagline: boolean;
  }[] = [
    {
      top: letters[0],
      bottom: letters[1],
      spacing: gap,
      radius: gap * 0.44,
      tagline: false,
      columns: [],
    },
  ];
  if (tagline) {
    groups.push({
      top: tagline[0],
      bottom: tagline[1],
      // Its strokes are a pixel or two wide
      spacing: Math.max(1, gap * 0.42),
      radius: Math.max(0.55, gap * 0.21),
      tagline: true,
      columns: [],
    });
  }
  for (const group of groups) {
    group.columns = runs(0, w, (x) => {
      for (let y = group.top; y < group.bottom; y++)
        if (solid(x, y)) return true;
      return false;
    });
  }

  const points: {
    x: number;
    y: number;
    radius: number;
    color: string;
    delay: number;
  }[] = [];
  const centerX = w / 2;
  const centerY = h / 2;

  groups.forEach((group) => {
    group.columns.forEach(([left, right], index) => {
      const letter: { x: number; y: number; edge: boolean }[] = [];
      const step = group.spacing;
      const rowStep = step * 0.866;
      let row = 0;
      for (let y = group.top + rowStep / 2; y < group.bottom; y += rowStep) {
        const offset = row++ % 2 ? step / 2 : 0;
        for (let x = left + offset + step / 4; x < right; x += step) {
          if (!solid(x, y)) continue;
          const d = step * 0.75;
          const edge =
            !solid(x - d, y) ||
            !solid(x + d, y) ||
            !solid(x, y - d) ||
            !solid(x, y + d);
          letter.push({ x, y, edge });
        }
      }
      if (!letter.length) return;

      const cx = letter.reduce((sum, p) => sum + p.x, 0) / letter.length;
      const cy = letter.reduce((sum, p) => sum + p.y, 0) / letter.length;
      const farthest = Math.max(
        ...letter.map((p) => Math.hypot(p.x - cx, p.y - cy)),
      );
      const start = group.tagline
        ? 3 * LETTER_STAGGER + index * TAGLINE_STAGGER
        : index * LETTER_STAGGER;

      for (const p of letter) {
        let delay = start + Math.random() * 60;
        if (!group.tagline) {
          if (p.edge) {
            // Around the letter the way a pen would go, from its top right
            const angle = Math.atan2(p.y - cy, p.x - cx);
            const turn =
              (((-Math.PI / 4 - angle) % (2 * Math.PI)) + 2 * Math.PI) %
              (2 * Math.PI);
            delay += (turn / (2 * Math.PI)) * TRACE_MS;
          } else {
            const depth = 1 - Math.hypot(p.x - cx, p.y - cy) / farthest;
            delay += TRACE_MS * 0.5 + depth * FILL_MS;
          }
        }
        const i = (Math.floor(p.y) * w + Math.floor(p.x)) * 4;
        // Coarse steps keep the colors, and so the fills per frame, few
        const q = (value: number) => Math.min(255, Math.round(value / 12) * 12);
        points.push({
          x: p.x - centerX,
          y: p.y - centerY,
          radius: group.radius,
          color: `rgb(${q(data[i])},${q(data[i + 1])},${q(data[i + 2])})`,
          delay,
        });
      }
    });
  });

  const count = points.length;
  const particles: Particles = {
    count,
    homeX: new Float32Array(count),
    homeY: new Float32Array(count),
    homeRadius: new Float32Array(count),
    homeAngle: new Float32Array(count),
    burstX: new Float32Array(count),
    burstY: new Float32Array(count),
    outX: new Float32Array(count),
    outY: new Float32Array(count),
    drift: new Float32Array(count),
    bendOut: new Float32Array(count),
    bendBack: new Float32Array(count),
    wobble: new Float32Array(count),
    wobbleSpeed: new Float32Array(count),
    phase: new Float32Array(count),
    scatterStart: new Float32Array(count),
    scatterEnd: new Float32Array(count),
    gatherStart: new Float32Array(count),
    gatherEnd: new Float32Array(count),
    leaveDelay: new Float32Array(count),
    leaveDistance: new Float32Array(count),
    size: new Float32Array(count),
    buckets: [],
    logoWidth: width,
    formedAt: 0,
  };

  const maxHome = Math.max(1, ...points.map((p) => Math.hypot(p.x, p.y)));
  const viewportRadius = Math.hypot(viewport.width, viewport.height) / 2;
  const random = (from: number, to: number) =>
    from + Math.random() * (to - from);
  const byColor = new Map<string, number[]>();
  points.forEach((p, i) => {
    const radius = Math.hypot(p.x, p.y);
    const angle = Math.atan2(p.y, p.x);
    particles.homeX[i] = p.x;
    particles.homeY[i] = p.y;
    particles.homeRadius[i] = radius;
    particles.homeAngle[i] = angle;

    // From a small core in the middle out into a loose cloud the shape of
    // the screen, roughly away from where the dot sits in the logo
    const core = viewportRadius * 0.05 * Math.sqrt(Math.random());
    const coreAngle = random(0, 2 * Math.PI);
    particles.burstX[i] = Math.cos(coreAngle) * core;
    particles.burstY[i] = Math.sin(coreAngle) * core;
    const outAngle = angle + random(-0.9, 0.9);
    const reach = 0.2 + 0.6 * Math.random() ** 0.8;
    particles.outX[i] = (Math.cos(outAngle) * reach * viewport.width) / 2;
    particles.outY[i] = (Math.sin(outAngle) * reach * viewport.height) / 2;
    // Most drift with the flow, at their own pace; a few against it
    particles.drift[i] =
      random(0.00025, 0.0009) * (Math.random() < 0.85 ? 1 : -1);
    particles.bendOut[i] = random(-0.55, 0.55);
    particles.bendBack[i] = random(0.1, 0.5) * (Math.random() < 0.8 ? 1 : -1);
    particles.wobble[i] = viewportRadius * random(0.01, 0.045);
    particles.wobbleSpeed[i] = random(0.003, 0.008);
    particles.phase[i] = random(0, 2 * Math.PI);

    // All at once, but each dot at its own speed so none move in step
    const scatterStart = random(0, 90);
    const scatterEnd = scatterStart + BURST_MS * random(0.7, 1.3);
    const gatherStart = Math.max(GATHER_AT + p.delay, scatterEnd);
    particles.scatterStart[i] = scatterStart;
    particles.scatterEnd[i] = scatterEnd;
    particles.gatherStart[i] = gatherStart;
    particles.gatherEnd[i] = gatherStart + GATHER_MS * random(0.85, 1.15);
    particles.formedAt = Math.max(particles.formedAt, particles.gatherEnd[i]);

    // From the outside in, like a wave
    particles.leaveDelay[i] = (1 - radius / maxHome) * 160 + Math.random() * 80;
    particles.leaveDistance[i] = viewportRadius * random(0.6, 1.3);
    particles.size[i] = p.radius;

    const bucket = byColor.get(p.color);
    if (bucket) bucket.push(i);
    else byColor.set(p.color, [i]);
  });
  particles.buckets = [...byColor].map(([color, indices]) => ({
    color,
    indices: Uint16Array.from(indices),
  }));
  return particles;
}

/** Plays the opening. Returns the cleanup; `onDone` runs when it ends. */
function play(
  overlay: HTMLDivElement,
  logo: HTMLDivElement,
  canvas: HTMLCanvasElement,
  onDone: () => void,
) {
  let frame = 0;
  let stopped = false;
  const cleanups: (() => void)[] = [];

  const fadeOut = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    const from = (element: HTMLElement) => getComputedStyle(element).opacity;
    // The logo and any dots go first, so they never fade over the app
    for (const layer of [logo, canvas]) {
      layer.animate([{ opacity: from(layer) }, { opacity: 0 }], {
        duration: FADE_MS / 2,
        fill: "forwards",
      });
    }
    overlay
      .animate([{ opacity: from(overlay) }, { opacity: 0 }], {
        duration: FADE_MS,
        delay: FADE_MS / 4,
        easing: "ease-out",
        fill: "forwards",
      })
      .finished.then(onDone, onDone);
  };

  overlay.addEventListener("pointerdown", fadeOut);
  cleanups.push(() => overlay.removeEventListener("pointerdown", fadeOut));

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    logo.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_MS,
      fill: "forwards",
    });
    const timer = setTimeout(fadeOut, 1100);
    cleanups.push(() => clearTimeout(timer));
    return () => {
      stopped = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }

  // The logo the stylesheet shows, so it is the same file
  const url = /url\(["']?(.*?)["']?\)/.exec(
    getComputedStyle(logo).backgroundImage,
  )?.[1];
  const image = new Image();
  if (url) image.src = url;

  image
    .decode()
    .then(() => {
      if (stopped) return;
      start();
    })
    // Without its logo the opening has nothing to show
    .catch(fadeOut);

  function start() {
    const context = canvas.getContext("2d");
    if (!context) return fadeOut();

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let scale = 1;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const box = logo.getBoundingClientRect();
    const particles = sampleLogo(image, box.width, box.height, {
      width: window.innerWidth,
      height: window.innerHeight,
    });

    // A rotated screen moves and resizes the logo: the dots follow it
    const measure = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const rect = logo.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      scale = rect.width / particles.logoWidth;
    };
    measure();
    window.addEventListener("resize", measure);
    cleanups.push(() => window.removeEventListener("resize", measure));

    const { count, formedAt } = particles;
    const leaveAt = formedAt + SETTLE_MS;
    const revealAt = leaveAt + REVEAL_DELAY;
    const end = Math.max(revealAt + 150 + REVEAL_MS, leaveAt + LEAVE_MS + 160);
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const size = new Float32Array(count);
    const turn = 2 * Math.PI;

    // Its own clock, so a page started in the background doesn't skip ahead
    let elapsed = 0;
    let last = performance.now();

    const draw = (now: number) => {
      elapsed += Math.min(now - last, 50);
      last = now;
      const t = elapsed;

      // The logo: appears once the dots have formed it, and lifts away before
      // the app shows, rather than fading over it
      const lift = clamp01((t - revealAt) / LOGO_OUT_MS);
      logo.style.opacity = String(clamp01((t - formedAt - 40) / 320) - lift);
      logo.style.transform = `translate(-50%, -50%) scale(${1 + 0.08 * easeInCubic(lift)})`;
      overlay.style.opacity = String(
        1 - clamp01((t - revealAt - 150) / REVEAL_MS),
      );

      // A light passes over the formed logo
      const shine =
        t > formedAt - 120 && t < leaveAt + 200
          ? -0.6 + ((t - formedAt + 120) / (SETTLE_MS + 320)) * 1.2
          : null;

      for (let i = 0; i < count; i++) {
        const r0 = particles.homeRadius[i];
        const a0 = particles.homeAngle[i];
        const hx = particles.homeX[i];
        const hy = particles.homeY[i];
        const scatterStart = particles.scatterStart[i];
        const gatherStart = particles.gatherStart[i];
        const gatherEnd = particles.gatherEnd[i];
        const leaveStart = leaveAt + particles.leaveDelay[i];
        let px = hx;
        let py = hy;
        let s = particles.size[i];

        if (t >= leaveStart) {
          // Off the logo, outwards, fading as it goes
          const p = clamp01((t - leaveStart) / LEAVE_MS);
          const radius = r0 + particles.leaveDistance[i] * easeInCubic(p);
          const angle = a0 + 0.45 * easeInCubic(p);
          px = Math.cos(angle) * radius;
          py = Math.sin(angle) * radius;
          s *= 1 - p;
        } else if (t <= scatterStart) {
          // Not out yet
          s = 0;
        } else if (t < gatherEnd) {
          // Where the dot is in the cloud: its spot, carried around the logo
          const outAt = (time: number) => {
            const turn = particles.drift[i] * (time - scatterStart);
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);
            const ox = particles.outX[i];
            const oy = particles.outY[i];
            return [ox * cos - oy * sin, ox * sin + oy * cos];
          };
          let from: number[];
          let to: number[];
          let bend: number;
          let p: number;
          if (t < gatherStart) {
            // Bursts out on a curve, slowing to a float, and grows in fast
            const scatterEnd = particles.scatterEnd[i];
            const q = clamp01((t - scatterStart) / (scatterEnd - scatterStart));
            p = easeOutQuart(q);
            from = [particles.burstX[i], particles.burstY[i]];
            to = outAt(t);
            bend = particles.bendOut[i];
            s *= 0.85 * (0.2 + 0.8 * easeOutQuart(clamp01(q * 5)));
          } else {
            // Drawn back home on a curve of its own
            const q = (t - gatherStart) / (gatherEnd - gatherStart);
            p = easeInOutCubic(q);
            from = outAt(gatherStart);
            to = [hx, hy];
            bend = particles.bendBack[i];
            // Grows back, swelling a little as it lands
            s *=
              (0.85 + 0.15 * q) *
              (1 + 0.7 * Math.exp(-(((q - 0.9) / 0.09) ** 2)));
          }
          // A quadratic curve whose middle is pushed off the straight line
          const dx = to[0] - from[0];
          const dy = to[1] - from[1];
          const cx = from[0] + dx / 2 - dy * bend;
          const cy = from[1] + dy / 2 + dx * bend;
          const u = 1 - p;
          px = u * u * from[0] + 2 * u * p * cx + p * p * to[0];
          py = u * u * from[1] + 2 * u * p * cy + p * p * to[1];

          // Turbulence, strongest mid-flight and none at either end, so the
          // letters still form exactly
          const flight = (t - scatterStart) / (gatherEnd - scatterStart);
          const sway = Math.sin(Math.PI * flight) * particles.wobble[i];
          const speed = particles.wobbleSpeed[i];
          const phase = particles.phase[i];
          px +=
            sway *
            (Math.sin(t * speed + phase) +
              0.5 * Math.sin(t * speed * 2.3 + phase * 1.7));
          py +=
            sway *
            (Math.cos(t * speed * 0.8 + phase * 1.3) +
              0.5 * Math.sin(t * speed * 1.9 + phase));
          // and a twinkle
          s *=
            1 -
            0.2 *
              Math.sin(Math.PI * flight) *
              (0.5 + 0.5 * Math.sin(t * 0.013 + phase * 3));
        }

        if (shine !== null) {
          const across = particles.homeX[i] / particles.logoWidth - shine;
          s *= 1 + 0.55 * Math.exp(-((across / 0.07) ** 2));
        }

        x[i] = centerX + px * scale;
        y[i] = centerY + py * scale;
        size[i] = s * scale;
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      // Trails while the dots fly: each frame only dims the last one. Not
      // once the logo is back, which must show through.
      if (t < formedAt) {
        context.globalAlpha = 0.32;
        context.fillStyle = BACKGROUND;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
      } else {
        context.clearRect(0, 0, width, height);
      }
      for (const { color, indices } of particles.buckets) {
        context.fillStyle = color;
        context.beginPath();
        for (const i of indices) {
          if (size[i] < 0.1) continue;
          context.moveTo(x[i] + size[i], y[i]);
          context.arc(x[i], y[i], size[i], 0, turn);
        }
        context.fill();
      }

      if (t >= end) {
        stopped = true;
        onDone();
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  }

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    cleanups.forEach((cleanup) => cleanup());
  };
}

export default function SplashScreen() {
  const [done, setDone] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-splash")) {
      setDone(true);
      return;
    }
    return play(
      overlayRef.current!,
      logoRef.current!,
      canvasRef.current!,
      () => {
        root.removeAttribute("data-splash");
        setDone(true);
      },
    );
  }, []);

  if (done) return null;

  return (
    <div ref={overlayRef} className="splash" aria-hidden="true">
      <div ref={logoRef} className="splash-logo" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
