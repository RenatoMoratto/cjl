import { useEffect, useRef, useState } from "react";
import {
  CircleNotch,
  type Icon,
  PauseCircle,
  PlayCircle,
  Queue,
  Repeat,
  RepeatOnce,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerLow,
  SpeakerX,
} from "@phosphor-icons/react";
import { PlaybackMode } from "@/hooks/useLocalAudioPlayer";

type SongPlayerProps = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  /** Waiting for the file: the play button shows a spinner. */
  isBuffering?: boolean;
  /** False where the device sets the volume (iOS): the control is hidden. */
  canSetVolume?: boolean;
  playbackMode: PlaybackMode;
  volume: number;
  togglePlay: () => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  handleSeek: (newTime: number) => void;
  handleVolumeChange: (newVolume: number) => void;
  /** Shows the previous/next buttons, and the "next" playback mode with them. */
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
};

// Read like the usual repeat-one / repeat-off / play-queue toggle; "stop" is
// the gray repeat the old on/off button showed when off
const PLAYBACK_MODES: Record<PlaybackMode, { label: string; Icon: Icon }> = {
  repeat: { label: "Repetir a música", Icon: RepeatOnce },
  stop: { label: "Parar ao terminar", Icon: Repeat },
  next: { label: "Tocar a próxima", Icon: Queue },
};

const formatTime = (time: number): string => {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const VolumeIcon = ({ volume }: { volume: number }) => {
  if (volume === 0) return <SpeakerX size={32} />;
  if (volume < 0.5) return <SpeakerLow size={32} />;
  return <SpeakerHigh size={32} />;
};

function SongPlayer({
  currentTime,
  duration,
  isPlaying,
  isBuffering = false,
  canSetVolume = true,
  playbackMode,
  volume,
  togglePlay,
  setPlaybackMode,
  handleSeek,
  handleVolumeChange,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: SongPlayerProps) {
  const [volumeVisible, setVolumeVisible] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumeButtonRef = useRef<HTMLButtonElement>(null);

  // Closes like the song menu: a tap outside or Escape
  useEffect(() => {
    if (!volumeVisible) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!volumeRef.current?.contains(event.target as Node)) {
        setVolumeVisible(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVolumeVisible(false);
        volumeButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [volumeVisible]);

  const hasNavigation = Boolean(onPrevious && onNext);
  // Without a song list there is no next song to play
  const modes: PlaybackMode[] = hasNavigation
    ? ["repeat", "stop", "next"]
    : ["repeat", "stop"];
  const nextMode = modes[(modes.indexOf(playbackMode) + 1) % modes.length];
  const { label: modeLabel, Icon: ModeIcon } = PLAYBACK_MODES[playbackMode];
  // Empty until the file's length is known, which is also when seeking works
  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* Progress Bar */}
      <div className="w-full flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={currentTime}
          onChange={(e) => handleSeek(Number(e.target.value))}
          disabled={!duration}
          className="w-full h-1 bg-gray-300 accent-primary rounded-lg appearance-none cursor-pointer disabled:cursor-default"
          style={{
            background: `linear-gradient(to right, var(--color-primary) ${progress}%, #D1D5DB ${progress}%)`,
          }}
          aria-label="Posição na música"
          aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
        />
        <div className="flex justify-between text-sm">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls: the icons keep their size, so with a larger text size the
          gaps narrow (down from 24px) instead of pushing them out of the card */}
      <div className="w-full max-w-[272px] flex items-center justify-between">
        {/* Playback Mode Button */}
        <button
          onClick={() => setPlaybackMode(nextMode)}
          className={`text-2xl ${
            playbackMode === "stop" ? "text-gray-500" : "text-primary"
          }`}
          aria-label={modeLabel}
          title={modeLabel}
        >
          <ModeIcon weight="bold" size={32} />
        </button>

        {hasNavigation && (
          <button
            onClick={onPrevious}
            disabled={!hasPrevious}
            className="text-2xl disabled:opacity-30"
            aria-label="Música anterior"
          >
            <SkipBack weight="fill" size={32} />
          </button>
        )}

        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="text-2xl"
          aria-label={isPlaying ? "Pausar" : "Tocar"}
          aria-busy={isBuffering}
        >
          {isBuffering ? (
            <CircleNotch weight="bold" size={48} className="animate-spin" />
          ) : isPlaying ? (
            <PauseCircle weight="bold" size={48} />
          ) : (
            <PlayCircle weight="bold" size={48} />
          )}
        </button>

        {hasNavigation && (
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="text-2xl disabled:opacity-30"
            aria-label="Próxima música"
          >
            <SkipForward weight="fill" size={32} />
          </button>
        )}

        {/* Volume Control */}
        {canSetVolume && (
          <div className="relative flex items-center" ref={volumeRef}>
            <button
              ref={volumeButtonRef}
              onClick={() => setVolumeVisible((prev) => !prev)}
              className="text-gray-500"
              aria-label="Volume"
              aria-expanded={volumeVisible}
            >
              <VolumeIcon volume={volume} />
            </button>

            {volumeVisible && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900/90 shadow-lg p-2 rounded-lg z-10 h-40 w-10 flex items-center justify-center">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) =>
                    handleVolumeChange(parseFloat(e.target.value))
                  }
                  className="w-36 h-1 appearance-none accent-primary transform -rotate-90"
                  aria-label="Volume"
                  style={{
                    background: `linear-gradient(to right, var(--color-primary) ${
                      volume * 100
                    }%, #D1D5DB ${volume * 100}%)`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SongPlayer;
