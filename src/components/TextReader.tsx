import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { Lines, Lyrics } from "@/types";
import { useEffect, useRef, useState } from "react";

// The size setting is in pixels at the usual 16px text size, and is applied
// relative to the surrounding text, so presentation mode's larger type
// enlarges it
const toEm = (size: number) => `${size / 16}em`;

/** The reader's text size until the user changes it. */
export const DEFAULT_FONT_SIZE = 22;

// Uneven, like the lines of a real lyric
const PLACEHOLDER_WIDTHS = ["70%", "55%", "80%", "45%", "65%", "75%", "50%"];

/**
 * Stands in for the lyric while the song loads, with lines of the reader's
 * own height. In the default size and alignment, not the user's: those are
 * kept in local storage, which the prerendered page can't read.
 */
export function LyricsPlaceholder() {
  return (
    <div role="status" className="px-5 overflow-hidden">
      <span className="sr-only">Carregando a letra...</span>
      <div
        aria-hidden
        className="flex flex-col items-center gap-2"
        style={{ fontSize: toEm(DEFAULT_FONT_SIZE) }}
      >
        {PLACEHOLDER_WIDTHS.map((width, index) => (
          // A line box of the text's height, with a bar a little shorter
          <div
            key={index}
            className="h-[1.5em] w-full flex items-center justify-center"
          >
            <div
              className="h-[0.75em] rounded-full bg-gray-700 animate-pulse"
              style={{ width }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

type TextReaderProps = {
  lyrics: Lyrics;
  currentTime: number;
  enableReading?: boolean;
  updateCurrentTime: (newTime: number) => void;
  textAlign: "center" | "left";
  fontSize: number;
};

// Keys that scroll a focused container
const SCROLL_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
];

/**
 * Brings a line to the middle of the reader. Only the reader scrolls, unlike
 * scrollIntoView, which would also move the page around it.
 */
function scrollToLine(scroller: HTMLElement, line: HTMLElement) {
  const lineBox = line.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  scroller.scrollTo({
    top:
      scroller.scrollTop +
      lineBox.top -
      scrollerBox.top -
      (scroller.clientHeight - lineBox.height) / 2,
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

function TextReader({
  lyrics,
  currentTime,
  enableReading = true,
  updateCurrentTime,
  textAlign,
  fontSize,
}: TextReaderProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  // Whether the reader keeps the active line in view. Scrolling by hand
  // stops it, the sync button starts it again; the highlight follows the
  // song either way.
  const [following, setFollowing] = useState(true);
  // Where the active line is when it's out of view, for the button's arrow
  const [activeLineOffscreen, setActiveLineOffscreen] = useState<
    "above" | "below" | null
  >(null);

  function getLineStyle(line: Lines, isActive: boolean, fontSize: number) {
    const size = line.isSolo ? fontSize * 0.75 : fontSize;
    return { fontSize: toEm(size) };
  }

  function getLineClass({
    enableReading,
    isActive,
    isPastLine,
    isSolo,
  }: {
    enableReading: boolean;
    isActive: boolean;
    isPastLine: boolean;
    isSolo?: boolean;
  }) {
    if (!enableReading) return "text-gray-200";

    if (isSolo) return isActive ? "text-white" : "opacity-75";

    if (isActive) return "font-bold text-primary";
    if (isPastLine) return "text-gray-200";
    return "text-gray-500";
  }

  const hasLines = lyrics.lines.length > 0;
  // A lyric that was never timed has every line at 0, which would hold the
  // last line highlighted from the start, so it is shown as plain text
  const isTimed = lyrics.lines.some((line) => line.time > 0);
  const syncing = enableReading && isTimed;

  const isActiveLine = (index: number) =>
    syncing &&
    currentTime >= lyrics.lines[index].time &&
    currentTime < (lyrics.lines[index + 1]?.time ?? Infinity);
  // The line the ref ends up on, which is the last active one
  const activeIndex = lyrics.lines.findLastIndex((_, index) =>
    isActiveLine(index),
  );

  // Only when the line changes, not on every time update, and only while
  // following, so a lyric being browsed by hand stays where it is
  useEffect(() => {
    if (following && scrollerRef.current && activeLineRef.current) {
      scrollToLine(scrollerRef.current, activeLineRef.current);
    }
  }, [activeIndex, following]);

  // Scrolling by hand: wheels and trackpads, touch, the keyboard and the
  // scrollbar. The reader's own scrolling fires none of these, so it is
  // never mistaken for the user's.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const stopFollowing = () => setFollowing(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.includes(event.key)) stopFollowing();
    };
    const handlePointerDown = (event: PointerEvent) => {
      // On the scrollbar, which is past the content's width
      if (event.target === scroller && event.offsetX >= scroller.clientWidth) {
        stopFollowing();
      }
    };

    scroller.addEventListener("wheel", stopFollowing, { passive: true });
    scroller.addEventListener("touchmove", stopFollowing, { passive: true });
    scroller.addEventListener("keydown", handleKeyDown);
    scroller.addEventListener("pointerdown", handlePointerDown);
    return () => {
      scroller.removeEventListener("wheel", stopFollowing);
      scroller.removeEventListener("touchmove", stopFollowing);
      scroller.removeEventListener("keydown", handleKeyDown);
      scroller.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [hasLines]);

  // Whether the active line is in view, as it moves on and as the lyric is
  // scrolled. Before the first line there is nothing to go back to.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const line = activeLineRef.current;
    if (!scroller || !line) {
      setActiveLineOffscreen(null);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.5) {
          setActiveLineOffscreen(null);
        } else {
          const top = entry.rootBounds?.top ?? 0;
          setActiveLineOffscreen(
            entry.boundingClientRect.top < top ? "above" : "below",
          );
        }
      },
      { root: scroller, threshold: 0.5 },
    );
    observer.observe(line);
    return () => observer.disconnect();
  }, [activeIndex]);

  if (!hasLines) {
    return (
      <div className="text-center">
        <p className="text-gray-200" style={{ fontSize: toEm(fontSize) }}>
          Ainda não temos a letra para esta música...
        </p>
      </div>
    );
  }

  const SyncIcon = activeLineOffscreen === "above" ? ArrowUp : ArrowDown;

  return (
    // The reader's box, which the sync button floats in. min-h-0 lets it
    // shrink to the space it's given, so the lyric scrolls inside it.
    <div className="relative min-h-0 flex flex-col">
      <div
        ref={scrollerRef}
        className={`min-h-0 px-5 overflow-y-auto ${textAlign === "center" ? "text-center" : "text-left"}`}
      >
        <div className="flex flex-col gap-2">
          {lyrics.lines.map((line, index) => {
            const isActive = isActiveLine(index);
            const isPastLine = currentTime < line.time;

            return (
              <p
                key={index}
                ref={isActive ? activeLineRef : null}
                onClick={() => {
                  // Playing from a line follows the lyric from there
                  setFollowing(true);
                  updateCurrentTime(line.time);
                }}
                style={getLineStyle(line, isActive, fontSize)}
                className={`transition-all duration-400 ${getLineClass({
                  enableReading: syncing,
                  isActive,
                  isPastLine,
                  isSolo: line.isSolo,
                })}`}
              >
                {line.isSolo ? `(${line.text})` : line.text}
              </p>
            );
          })}
        </div>
      </div>

      {!following && activeLineOffscreen && (
        <button
          type="button"
          // Following again scrolls back to the active line
          onClick={() => setFollowing(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 whitespace-nowrap rounded-full border border-white/25 bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition hover:bg-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <SyncIcon size={16} weight="bold" aria-hidden />
          Sincronizar letra
        </button>
      )}
    </div>
  );
}

export default TextReader;
