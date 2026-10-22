import {
  TIMING,
  type Moments,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
} from "./timeline";

/**
 * One dot of the opening. Positions are relative to the logo's center, in
 * CSS px at the size the logo was sampled at; the frame loop scales them to
 * the logo's current size.
 */
export interface Dot {
  /** Its place in the logo, in the color of the logo there. */
  homeX: number;
  homeY: number;
  homeRadius: number; // from the logo's center
  homeAngle: number;
  radius: number;
  color: string;

  /** Where it floats before heading home, carried around the logo's center. */
  floatX: number;
  floatY: number;
  drift: number; // radians per ms; a few go against the flow
  wobble: number; // how far it sways while free, in px
  wobbleSpeed: number;
  phase: number;
  /** How far its path home bows to one side, and which side. */
  bend: number;

  appearAt: number;
  gatherAt: number; // leaves its float for home
  landAt: number;
  /** After the `leave` moment, when it flies off the formed logo. */
  leaveDelay: number;
  leaveDistance: number;
}

/**
 * The dots of the logo shown at `width` by `height`, from its own pixels, and
 * when the last of them lands.
 */
export function dotsFromLogo(
  image: HTMLImageElement,
  width: number,
  height: number,
  viewport: { width: number; height: number },
) {
  const spots = spotsOnLogo(image, width, height);
  const farthest = Math.max(1, ...spots.map((s) => Math.hypot(s.x, s.y)));
  const dots = spots.map((spot) => toDot(spot, farthest, viewport));
  return { dots, formedAt: Math.max(...dots.map((dot) => dot.landAt)) };
}

/** The dots of each color, so a frame needs one fill per color. */
export function byColor(dots: Dot[]) {
  const groups = new Map<string, Dot[]>();
  for (const dot of dots) {
    const group = groups.get(dot.color);
    if (group) group.push(dot);
    else groups.set(dot.color, [dot]);
  }
  return [...groups].map(([color, dots]) => ({ color, dots }));
}

// ---------------------------------------------------------------------------
// Where the dots come from: a hex grid over each letter of the logo

/** A place on the logo for a dot, and how long after `gatherAt` it heads home. */
interface Spot {
  x: number;
  y: number;
  radius: number;
  color: string;
  homeDelay: number;
}

/** A letter of the logo (C, J, L, or one of the tagline), as a box on it. */
interface Letter {
  left: number;
  right: number;
  top: number;
  bottom: number;
  spacing: number; // of its grid
  radius: number; // of its dots
  inTagline: boolean;
  startDelay: number; // after `gatherAt`, when its first dots head home
}

function spotsOnLogo(image: HTMLImageElement, width: number, height: number) {
  const pixels = readPixels(image, width, height);
  return findLetters(pixels, width).flatMap((letter) => {
    const grid = gridOver(letter, pixels.solid);
    if (!grid.length) return [];
    const penOrder = tracing(grid);
    return grid.map(
      (point): Spot => ({
        x: point.x - pixels.width / 2,
        y: point.y - pixels.height / 2,
        radius: letter.radius,
        color: pixels.colorAt(point.x, point.y),
        homeDelay:
          letter.startDelay +
          Math.random() * 60 +
          // The tagline's letters are too small to trace
          (letter.inTagline ? 0 : penOrder(point)),
      }),
    );
  });
}

/** The logo drawn at the size shown, to read its pixels. */
function readPixels(image: HTMLImageElement, width: number, height: number) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);
  const at = (x: number, y: number) => (Math.floor(y) * w + Math.floor(x)) * 4;
  // Coarse steps keep the colors, and so the fills per frame, few
  const step = (value: number) => Math.min(255, Math.round(value / 12) * 12);

  return {
    width: w,
    height: h,
    solid: (x: number, y: number) =>
      x >= 0 && y >= 0 && x < w && y < h && data[at(x, y) + 3] > 140,
    colorAt: (x: number, y: number) => {
      const i = at(x, y);
      return `rgb(${step(data[i])},${step(data[i + 1])},${step(data[i + 2])})`;
    },
  };
}

type Pixels = ReturnType<typeof readPixels>;

/**
 * The letters, told apart by the gaps in the logo: the empty rows between the
 * letters and the tagline under them, then the empty columns between letters.
 */
function findLetters({ width: w, height: h, solid }: Pixels, width: number) {
  const rowFilled = (y: number) => {
    for (let x = 0; x < w; x++) if (solid(x, y)) return true;
    return false;
  };
  const bands = runs(0, h, rowFilled);

  // About the same number of dots on any screen: the grid scales with the logo
  const gap = Math.max(2.2, width / 75);
  const rows = [
    {
      band: bands[0] ?? [0, h],
      spacing: gap,
      radius: gap * 0.44,
      inTagline: false,
    },
  ];
  if (bands.length > 1) {
    rows.push({
      band: [bands[1][0], bands.at(-1)![1]],
      // Its strokes are a pixel or two wide
      spacing: Math.max(1, gap * 0.42),
      radius: Math.max(0.55, gap * 0.21),
      inTagline: true,
    });
  }

  return rows.flatMap(({ band: [top, bottom], ...row }) => {
    const columnFilled = (x: number) => {
      for (let y = top; y < bottom; y++) if (solid(x, y)) return true;
      return false;
    };
    return runs(0, w, columnFilled).map(
      ([left, right], index): Letter => ({
        left,
        right,
        top,
        bottom,
        ...row,
        startDelay: row.inTagline
          ? 3 * TIMING.letterStagger + index * TIMING.taglineStagger
          : index * TIMING.letterStagger,
      }),
    );
  });
}

/** The points of a hex grid that fall on the letter, and which are its edge. */
function gridOver(letter: Letter, solid: Pixels["solid"]) {
  const points: { x: number; y: number; edge: boolean }[] = [];
  const step = letter.spacing;
  const rowStep = step * 0.866;
  const reach = step * 0.75;
  let row = 0;
  for (let y = letter.top + rowStep / 2; y < letter.bottom; y += rowStep) {
    const offset = row++ % 2 ? step / 2 : 0;
    for (let x = letter.left + offset + step / 4; x < letter.right; x += step) {
      if (!solid(x, y)) continue;
      const edge =
        !solid(x - reach, y) ||
        !solid(x + reach, y) ||
        !solid(x, y - reach) ||
        !solid(x, y + reach);
      points.push({ x, y, edge });
    }
  }
  return points;
}

/**
 * When each point of a letter arrives, as a pen would draw it: around the
 * outline from its top right, then the inside, from the outline inwards.
 */
function tracing(points: { x: number; y: number; edge: boolean }[]) {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const distance = (p: { x: number; y: number }) =>
    Math.hypot(p.x - cx, p.y - cy);
  const farthest = Math.max(...points.map(distance));
  const fullTurn = 2 * Math.PI;

  return (p: { x: number; y: number; edge: boolean }) => {
    if (!p.edge) {
      const depth = 1 - distance(p) / farthest;
      return TIMING.trace * 0.5 + depth * TIMING.fill;
    }
    const angle = Math.atan2(p.y - cy, p.x - cx);
    const turned = (((-Math.PI / 4 - angle) % fullTurn) + fullTurn) % fullTurn;
    return (turned / fullTurn) * TIMING.trace;
  };
}

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

const random = (from: number, to: number) => from + Math.random() * (to - from);

/** Gives a spot its own float, pace and moments, so no two dots move alike. */
function toDot(
  spot: Spot,
  farthest: number,
  viewport: { width: number; height: number },
): Dot {
  const viewportRadius = Math.hypot(viewport.width, viewport.height) / 2;
  const homeRadius = Math.hypot(spot.x, spot.y);
  const homeAngle = Math.atan2(spot.y, spot.x);
  // Anywhere on the screen, evenly spread, loosely on the side of the logo
  // the dot belongs to
  const floatAngle = homeAngle + random(-1.5, 1.5);
  const reach = 0.1 + 0.85 * Math.sqrt(Math.random());
  // Home only once fully in view
  const appearAt = random(0, TIMING.appear);
  const gatherAt = Math.max(
    TIMING.gatherAt + spot.homeDelay,
    appearAt + TIMING.fadeIn,
  );

  return {
    homeX: spot.x,
    homeY: spot.y,
    homeRadius,
    homeAngle,
    radius: spot.radius,
    color: spot.color,
    floatX: (Math.cos(floatAngle) * reach * viewport.width) / 2,
    floatY: (Math.sin(floatAngle) * reach * viewport.height) / 2,
    drift: random(0.00025, 0.0009) * (Math.random() < 0.85 ? 1 : -1),
    wobble: viewportRadius * random(0.01, 0.045),
    wobbleSpeed: random(0.003, 0.008),
    phase: random(0, 2 * Math.PI),
    bend: random(0.1, 0.5) * (Math.random() < 0.8 ? 1 : -1),
    appearAt,
    gatherAt,
    landAt: gatherAt + TIMING.gather * random(0.85, 1.15),
    // From the outside in, like a wave
    leaveDelay:
      (1 - homeRadius / farthest) * TIMING.leaveWave + Math.random() * 80,
    leaveDistance: viewportRadius * random(0.6, 1.3),
  };
}

// ---------------------------------------------------------------------------
// Where a dot is at a given time

/**
 * Where `dot` is at time `t`, and its radius. Before it appears it has no
 * size; then it floats, heads home, rests there, and finally flies off.
 */
export function dotAt(dot: Dot, t: number, { leave }: Moments) {
  const leaveAt = leave + dot.leaveDelay;
  if (t >= leaveAt) return flyingOff(dot, (t - leaveAt) / TIMING.leave);
  if (t <= dot.appearAt) return { x: dot.homeX, y: dot.homeY, size: 0 };
  if (t >= dot.landAt) return { x: dot.homeX, y: dot.homeY, size: dot.radius };
  if (t < dot.gatherAt) {
    const faded = easeOutCubic(clamp01((t - dot.appearAt) / TIMING.fadeIn));
    return loose(dot, t, floatingAt(dot, t), 0.85 * faded, 1);
  }

  // Home on a curve, growing back and swelling a little as it lands
  const flown = (t - dot.gatherAt) / (dot.landAt - dot.gatherAt);
  const p = easeInOutCubic(flown);
  const swell = 1 + 0.7 * Math.exp(-(((flown - 0.9) / 0.09) ** 2));
  return loose(dot, t, homeward(dot, p), (0.85 + 0.15 * flown) * swell, 1 - p);
}

/** How much bigger the passing light makes the dot (`shine`: see layersAt). */
export function shineOn(dot: Dot, shine: number | null, logoWidth: number) {
  if (shine === null) return 1;
  const across = dot.homeX / logoWidth - shine;
  return 1 + 0.55 * Math.exp(-((across / 0.07) ** 2));
}

/** Its float, carried around the logo's center at its own pace. */
function floatingAt(dot: Dot, t: number) {
  const turn = dot.drift * (t - dot.appearAt);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return {
    x: dot.floatX * cos - dot.floatY * sin,
    y: dot.floatX * sin + dot.floatY * cos,
  };
}

/** `p` of the way home on a curve whose middle bows off the straight line. */
function homeward(dot: Dot, p: number) {
  const from = floatingAt(dot, dot.gatherAt);
  const bendX = (from.x + dot.homeX) / 2 - (dot.homeY - from.y) * dot.bend;
  const bendY = (from.y + dot.homeY) / 2 + (dot.homeX - from.x) * dot.bend;
  const u = 1 - p;
  return {
    x: u * u * from.x + 2 * u * p * bendX + p * p * dot.homeX,
    y: u * u * from.y + 2 * u * p * bendY + p * p * dot.homeY,
  };
}

/**
 * Adds the sway and twinkle of a dot that is still `free` (1 while it floats,
 * 0 once home), so the letters still form exactly.
 */
function loose(
  dot: Dot,
  t: number,
  { x, y }: { x: number; y: number },
  scale: number,
  free: number,
) {
  const sway = free * dot.wobble;
  const speed = dot.wobbleSpeed;
  const phase = dot.phase;
  const twinkle = 0.5 + 0.5 * Math.sin(t * 0.013 + phase * 3);
  return {
    x:
      x +
      sway *
        (Math.sin(t * speed + phase) +
          0.5 * Math.sin(t * speed * 2.3 + phase * 1.7)),
    y:
      y +
      sway *
        (Math.cos(t * speed * 0.8 + phase * 1.3) +
          0.5 * Math.sin(t * speed * 1.9 + phase)),
    size: dot.radius * scale * (1 - 0.2 * free * twinkle),
  };
}

/** Off the formed logo, outwards, fading as it goes. */
function flyingOff(dot: Dot, progress: number) {
  const p = easeInCubic(clamp01(progress));
  const radius = dot.homeRadius + dot.leaveDistance * p;
  const angle = dot.homeAngle + 0.45 * p;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    size: dot.radius * (1 - clamp01(progress)),
  };
}
