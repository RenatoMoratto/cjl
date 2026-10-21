import { Lines, Lyrics } from "@/types";
import { useEffect, useRef } from "react";

// The size setting is in pixels at the usual 16px text size, and is applied
// relative to the device's text size, so a larger system font enlarges it
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

function TextReader({
  lyrics,
  currentTime,
  enableReading = true,
  updateCurrentTime,
  textAlign,
  fontSize,
}: TextReaderProps) {
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);

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

  const isActiveLine = (index: number) =>
    currentTime >= lyrics.lines[index].time &&
    currentTime < (lyrics.lines[index + 1]?.time ?? Infinity);
  // The line the ref ends up on, which is the last active one
  const activeIndex = lyrics.lines.findLastIndex((_, index) =>
    isActiveLine(index),
  );

  // Only when the line changes, not on every time update, so the lyric can
  // be scrolled by hand while a line is being sung
  useEffect(() => {
    if (enableReading && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIndex, enableReading]);

  if (lyrics.lines.length === 0) {
    return (
      <div className="text-center">
        <p className="text-gray-200" style={{ fontSize: toEm(fontSize) }}>
          Ainda não temos a letra para esta música...
        </p>
      </div>
    );
  }

  return (
    <div
      className={`px-5 overflow-y-auto ${textAlign === "center" ? "text-center" : "text-left"}`}
    >
      <div className="flex flex-col gap-2">
        {lyrics.lines.map((line, index) => {
          const isActive = isActiveLine(index);
          const isPastLine = currentTime < line.time;

          return (
            <p
              key={index}
              ref={isActive ? activeLineRef : null}
              onClick={() => updateCurrentTime(line.time)}
              style={getLineStyle(line, isActive, fontSize)}
              className={`transition-all duration-400 ${getLineClass({
                enableReading,
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
  );
}

export default TextReader;
