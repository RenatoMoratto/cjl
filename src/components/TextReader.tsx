import { Lines, Lyrics } from "@/types";
import { useEffect, useRef } from "react";

// The size setting is in pixels at the usual 16px text size, and is applied
// relative to the device's text size, so a larger system font enlarges it
const toEm = (size: number) => `${size / 16}em`;

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

  useEffect(() => {
    if (enableReading && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentTime, enableReading]);

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
          const nextLineTime = lyrics.lines[index + 1]?.time ?? Infinity;
          const isActive =
            currentTime >= line.time && currentTime < nextLineTime;
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
