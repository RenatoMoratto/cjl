import { useState, useRef } from "react";
import {
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

  const hasNavigation = Boolean(onPrevious && onNext);
  // Without a song list there is no next song to play
  const modes: PlaybackMode[] = hasNavigation
    ? ["repeat", "stop", "next"]
    : ["repeat", "stop"];
  const nextMode = modes[(modes.indexOf(playbackMode) + 1) % modes.length];
  const { label: modeLabel, Icon: ModeIcon } = PLAYBACK_MODES[playbackMode];

  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Progress Bar */}
      <div className="w-full flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={currentTime}
          onChange={(e) => handleSeek(Number(e.target.value))}
          className="w-full h-1 bg-gray-300 accent-primary rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--color-primary) ${
              (currentTime / duration) * 100
            }%, #D1D5DB ${(currentTime / duration) * 100}%)`,
          }}
          aria-label="Seek audio"
        />
        <div className="flex justify-between text-sm">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
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
            aria-label="Previous song"
          >
            <SkipBack weight="fill" size={32} />
          </button>
        )}

        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="text-2xl"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
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
            aria-label="Next song"
          >
            <SkipForward weight="fill" size={32} />
          </button>
        )}

        {/* Volume Control */}
        <div className="relative flex items-center">
          <button
            onClick={() => setVolumeVisible((prev) => !prev)}
            className="text-gray-500"
            aria-label="Toggle volume control"
          >
            <VolumeIcon volume={volume} />
          </button>

          {volumeVisible && (
            <div
              ref={volumeRef}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900/90 shadow-lg p-2 rounded-lg z-10 h-40 w-10 flex items-center justify-center"
              tabIndex={0}
              onBlur={(e) => {
                if (!volumeRef.current?.contains(e.relatedTarget as Node)) {
                  setVolumeVisible(false);
                }
              }}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-36 h-1 appearance-none accent-primary transform -rotate-90"
                aria-label="Adjust volume"
                style={{
                  background: `linear-gradient(to right, var(--color-primary) ${
                    volume * 100
                  }%, #D1D5DB ${volume * 100}%)`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SongPlayer;
