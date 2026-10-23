import { X } from "@phosphor-icons/react";
import { ReactNode, useEffect, useRef } from "react";

// The lyric's text size grows with the screen, to be read from across the
// room on a projector or a TV, and never drops below the page's own size on
// a phone. The reader's size setting still scales it.
const LYRICS_FONT_SIZE = "max(1rem, min(2.5vw, 4.5dvh))";

type PresentationModeProps = {
  title?: string;
  /** The song's lyric, shown large. */
  lyrics: ReactNode;
  /** The playback controls, kept along the bottom. */
  player?: ReactNode;
  onExit: () => void;
};

/**
 * The lyric alone on the screen, for the choir to sing along on a big
 * screen. It covers the page and leaves the audio alone, which lives in the
 * page, so the song plays on as it opens and closes.
 *
 * The browser's full screen is asked for by the tap that opens it, which is
 * the only time browsers allow it. Leaving full screen (Esc, or Android's back
 * gesture) also closes the presentation, and closing it leaves full screen.
 */
export default function PresentationMode({
  title,
  lyrics,
  player,
  onExit,
}: PresentationModeProps) {
  // Read from the listeners, which are added once
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExitRef.current();
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) onExitRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-950">
      <div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-10">
        <h2 className="min-w-0 truncate text-xl font-bold text-gray-400">
          {title}
        </h2>
        <button
          onClick={onExit}
          className="p-2 -m-2 text-gray-400 hover:text-white transition"
          aria-label="Sair do modo apresentação"
          title="Sair do modo apresentação"
        >
          <X size={32} weight="bold" />
        </button>
      </div>

      <div
        className="flex-1 min-h-0 py-5 sm:px-5 flex flex-col justify-center gap-3"
        style={{ fontSize: LYRICS_FONT_SIZE }}
      >
        {lyrics}
      </div>

      {player && (
        <div className="w-full max-w-3xl mx-auto px-5 pb-5 flex flex-col gap-4">
          {player}
        </div>
      )}
    </div>
  );
}
