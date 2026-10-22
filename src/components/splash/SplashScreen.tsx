import { useEffect, useRef, useState } from "react";
import { byColor, dotAt, dotsFromLogo, shineOn } from "./dots";
import { TIMING, layersAt, moments } from "./timeline";

/**
 * The installed app's opening. Dots fade in all over the screen, already
 * drifting, then gather letter by letter (each outline first, then its
 * inside) to form the logo. The real logo appears under them, and the dots
 * fly off as the app appears.
 *
 * The script in _document.tsx marks a launch with data-splash on <html>
 * before the first paint, so the overlay covers the page from the first
 * frame (globals.css). Anywhere else the overlay stays hidden, and goes once
 * mounted. A tap skips it; with reduced motion the logo just fades in and out.
 *
 * timeline.ts says when each part happens, dots.ts where the dots come from
 * and where each one is at a given time; this file draws them.
 */
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
    const layers = {
      overlay: overlayRef.current!,
      logo: logoRef.current!,
      canvas: canvasRef.current!,
    };
    return play(layers, () => {
      root.removeAttribute("data-splash");
      setDone(true);
    });
  }, []);

  if (done) return null;

  return (
    <div ref={overlayRef} className="splash" aria-hidden="true">
      <div ref={logoRef} className="splash-logo" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

interface Layers {
  overlay: HTMLDivElement;
  logo: HTMLDivElement;
  canvas: HTMLCanvasElement;
}

/** Plays the opening. Returns the cleanup; `onDone` runs when it ends. */
function play(layers: Layers, onDone: () => void) {
  const { overlay, logo } = layers;
  let stopAnimation = () => {};
  let stopped = false;
  const stop = () => {
    stopped = true;
    stopAnimation();
  };

  // Quickly, and the logo and any dots first, so they never fade over the app
  const fadeOut = () => {
    if (stopped) return;
    stop();
    const from = (element: HTMLElement) => getComputedStyle(element).opacity;
    for (const layer of [logo, layers.canvas]) {
      layer.animate([{ opacity: from(layer) }, { opacity: 0 }], {
        duration: TIMING.fadeOut / 2,
        fill: "forwards",
      });
    }
    overlay
      .animate([{ opacity: from(overlay) }, { opacity: 0 }], {
        duration: TIMING.fadeOut,
        delay: TIMING.fadeOut / 4,
        easing: "ease-out",
        fill: "forwards",
      })
      .finished.then(onDone, onDone);
  };
  overlay.addEventListener("pointerdown", fadeOut);

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    logo.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: TIMING.fadeOut,
      fill: "forwards",
    });
    timer = setTimeout(fadeOut, TIMING.reducedMotionHold);
  } else {
    // The logo the stylesheet shows, so it is the same file
    const url = /url\(["']?(.*?)["']?\)/.exec(
      getComputedStyle(logo).backgroundImage,
    )?.[1];
    const image = new Image();
    if (url) image.src = url;
    image
      .decode()
      .then(() => {
        if (!stopped) stopAnimation = animate(layers, image, onDone);
      })
      // Without its logo the opening has nothing to show
      .catch(fadeOut);
  }

  return () => {
    stop();
    clearTimeout(timer);
    overlay.removeEventListener("pointerdown", fadeOut);
  };
}

/**
 * Runs the dots from the first frame to the last, then calls `onDone`.
 * Returns what stops it early.
 */
function animate(
  { overlay, logo, canvas }: Layers,
  image: HTMLImageElement,
  onDone: () => void,
) {
  const context = canvas.getContext("2d");
  // Caught by play, which then just fades out
  if (!context) throw new Error("No 2D canvas");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const sampled = logo.getBoundingClientRect();
  const { dots, formedAt } = dotsFromLogo(
    image,
    sampled.width,
    sampled.height,
    { width: window.innerWidth, height: window.innerHeight },
  );
  const colors = byColor(dots);
  const at = moments(formedAt);

  // Where the logo is now: a rotated screen moves and resizes it, and the dots
  // follow it
  let view = { width: 0, height: 0, centerX: 0, centerY: 0, scale: 1 };
  const measure = () => {
    const box = logo.getBoundingClientRect();
    view = {
      width: window.innerWidth,
      height: window.innerHeight,
      centerX: box.left + box.width / 2,
      centerY: box.top + box.height / 2,
      scale: box.width / sampled.width,
    };
    canvas.width = Math.round(view.width * ratio);
    canvas.height = Math.round(view.height * ratio);
  };
  measure();
  window.addEventListener("resize", measure);

  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", measure);
  };

  // Its own clock, so a page started in the background doesn't skip ahead
  let elapsed = 0;
  let last = performance.now();

  const draw = (now: number) => {
    elapsed += Math.min(now - last, 50);
    last = now;
    const t = elapsed;

    const { logoOpacity, logoScale, overlayOpacity, shine } = layersAt(t, at);
    logo.style.opacity = String(logoOpacity);
    logo.style.transform = `translate(-50%, -50%) scale(${logoScale})`;
    overlay.style.opacity = String(overlayOpacity);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Trails while the dots fly: each frame only dims the last one. Not once
    // the logo is back, which must show through.
    if (t < formedAt) {
      context.globalAlpha = 0.32;
      context.fillStyle = BACKGROUND;
      context.fillRect(0, 0, view.width, view.height);
      context.globalAlpha = 1;
    } else {
      context.clearRect(0, 0, view.width, view.height);
    }

    for (const group of colors) {
      context.fillStyle = group.color;
      context.beginPath();
      for (const dot of group.dots) {
        const { x, y, size } = dotAt(dot, t, at);
        const radius = size * shineOn(dot, shine, sampled.width) * view.scale;
        if (radius < 0.1) continue;
        const cx = view.centerX + x * view.scale;
        const cy = view.centerY + y * view.scale;
        context.moveTo(cx + radius, cy);
        context.arc(cx, cy, radius, 0, 2 * Math.PI);
      }
      context.fill();
    }

    if (t >= at.end) {
      stop();
      onDone();
    } else {
      frame = requestAnimationFrame(draw);
    }
  };
  frame = requestAnimationFrame(draw);
  return stop;
}

// Same color as the launch images and the manifest's background_color
const BACKGROUND = "#111827";
