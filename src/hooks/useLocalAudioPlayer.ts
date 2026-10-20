import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What happens when a song ends: it starts over, playback stops, or the
 * caller is asked to move on to the next song (see `onPlayNext`).
 */
export type PlaybackMode = "repeat" | "stop" | "next";

type Options = {
  /** Starts playing each new `audioSrc` as soon as it is set. */
  autoPlay?: boolean;
  /** Called when a song ends in "next" mode. */
  onPlayNext?: () => void;
};

/**
 * `audioSrc` is optional because the URL now arrives asynchronously from the
 * API. Passing undefined keeps the hook idle instead of pointing the Audio
 * element at a half-built URL.
 */
export function useLocalAudioPlayer(
  audioSrc?: string,
  { autoPlay = false, onPlayNext }: Options = {},
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1); // range de 0 a 1
  const [isMuted, setIsMuted] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("stop");

  // Read from the element's listeners, which are added once
  const playbackModeRef = useRef(playbackMode);
  playbackModeRef.current = playbackMode;
  const onPlayNextRef = useRef(onPlayNext);
  onPlayNextRef.current = onPlayNext;
  // Read when the source changes, not whenever the flag does
  const autoPlayRef = useRef(autoPlay);
  autoPlayRef.current = autoPlay;

  const togglePlay = () => {
    if (!audioRef.current || !audioSrc) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleSeek = (newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const updateCurrentTime = (newTime: number) => {
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    if (isMuted) {
      toggleMute();
    }
    const vol = Math.max(0, Math.min(1, newVolume));
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  /**
   * The clock as the element sees it, right now.
   *
   * `currentTime` in state only moves on the `timeupdate` event, which fires
   * about four times a second. That is fine for a progress bar and useless for
   * stamping a lyric line: every stamp would land on a 250 ms grid. Reading the
   * ref sidesteps that, and reading it through a callback keeps the identity
   * stable for effects, which the returned `audio` — captured during render,
   * and null on the first pass — does not.
   */
  const getCurrentTime = useCallback(
    () => audioRef.current?.currentTime ?? 0,
    [],
  );

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !audioRef.current.muted;
    setIsMuted(audioRef.current.muted);
  };

  // One element for every song, rather than one per source: mobile browsers
  // only let an element play on its own once the user has started it, so this
  // is what lets the next song start when one ends
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      if (playbackModeRef.current === "next") onPlayNextRef.current?.();
    };
    // A file that fails to load never plays, even if play() was called
    const onError = () => setIsPlaying(false);

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setDuration(0);
    setCurrentTime(0);

    if (!audioSrc) {
      // Stops downloading the previous song
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = audioSrc;

    if (autoPlayRef.current) {
      // Rejected when the browser blocks autoplay, the file fails to load or
      // another song replaces this one first. It then waits for the play button.
      audio.play().catch(() => {});
    }
  }, [audioSrc]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = playbackMode === "repeat";
    }
  }, [playbackMode]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  return {
    audio: audioRef.current,
    isPlaying,
    duration,
    currentTime,
    getCurrentTime,
    volume,
    isMuted,
    playbackMode,
    togglePlay,
    handleSeek,
    handleVolumeChange,
    toggleMute,
    setPlaybackMode,
    updateCurrentTime,
  };
}
