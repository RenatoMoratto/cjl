import Layout from "@/components/Layout";
import TextReader, {
  DEFAULT_FONT_SIZE,
  LyricsPlaceholder,
} from "@/components/TextReader";
import { useLocalAudioPlayer } from "@/hooks/useLocalAudioPlayer";
import { CaretLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { isVoice, SongDetail, SongSummary } from "@/types";
import TextSettingsDropdown from "@/components/TextSettingsDropdown";
import { useCopyToClipboard, useLocalStorage } from "usehooks-ts";
import { toast } from "react-toastify";
import { useOfflineSong } from "@/hooks/useOfflineSongs";
import { useOnline } from "@/hooks/useOnline";
import LoadError from "@/components/LoadError";
import { FetchError } from "@/lib/fetcher";
import { songsForVoice } from "@/lib/songs";
// Imported directly (not lazy) so the player is part of the page's cached files offline
import SongPlayer from "@/components/SongPlayer";

export default function Musica() {
  const params = useParams();
  const router = useRouter();

  const [enableReading, setEnableReading] = useLocalStorage(
    "enable-reading",
    true,
  );
  const [textAlign, setTextAlign] = useLocalStorage<"left" | "center">(
    "text-align",
    "center",
  );
  const [fontSize, setFontSize] = useLocalStorage(
    "font-size",
    DEFAULT_FONT_SIZE,
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [, copyToClipboard] = useCopyToClipboard();

  const rawVoice = Array.isArray(params?.voz) ? params.voz[0] : params?.voz;
  const voice = rawVoice && isVoice(rawVoice) ? rawVoice : undefined;
  const songId = Number(params?.musica ?? "");
  // A segment that is no id at all (a mistyped link) would otherwise fetch
  // nothing and leave the page loading forever
  const isValidId = Number.isInteger(songId) && songId > 0;
  const isInvalidId = Boolean(params?.musica) && !isValidId;

  // The params are empty until the router is ready, so nothing is fetched yet
  const {
    data: song,
    error: fetchError,
    isValidating,
    mutate,
  } = useSWR<SongDetail, FetchError>(
    isValidId ? `/api/musicas/${songId}` : null,
  );
  const loading = !song && !fetchError && !isInvalidId;
  // Fails without a network only when the song isn't saved offline
  const error = isInvalidId
    ? "Música não encontrada"
    : fetchError && !song
      ? fetchError.offline
        ? "Música não disponível offline"
        : fetchError.status === 404 || fetchError.status === 400
          ? "Música não encontrada"
          : "Não foi possível carregar a música."
      : null;
  // A missing song stays missing; anything else may work a second time
  const canRetry = Boolean(error) && !isInvalidId && fetchError?.status !== 404;
  const online = useOnline();

  // A song may simply not have a kit for this voice — five of them have no
  // "todos" mix — and the URL segment itself is user-supplied.
  const track = song?.tracks.find((item) => item.voice === voice);
  const isTrackUnavailable = Boolean(song) && !track;

  const { isAvailableOffline, isSaving, toggleOffline } = useOfflineSong(
    song,
    voice,
  );

  // The voice's song list, for previous/next. Reuses the list page's copy,
  // and is only requested when the page was opened directly.
  const { data: songs } = useSWR<SongSummary[], FetchError>("/api/musicas", {
    revalidateIfStale: false,
  });
  const voiceSongs = songs && voice ? songsForVoice(songs, voice) : [];
  const songIndex = voiceSongs.findIndex((item) => item.id === songId);
  const previousSong = songIndex > 0 ? voiceSongs[songIndex - 1] : undefined;
  const nextSong = songIndex >= 0 ? voiceSongs[songIndex + 1] : undefined;

  // Opened from "Tocar todas" on the list page
  const isPlayAll = router.query.tocar === "todas";
  // Whether the song being opened starts playing: skipping keeps playback
  // going if it was, and a song that ends in "next" mode starts the next one
  const [autoPlay, setAutoPlay] = useState(false);

  // Replaced rather than pushed, so going back leaves the player instead of
  // stepping through every song played
  const goToSong = (target: SongSummary | undefined, play: boolean) => {
    if (!target || !voice) return;
    setAutoPlay(play);
    router.replace(`/kits/${voice}/${target.id}`);
  };

  const {
    volume,
    currentTime,
    duration,
    isPlaying,
    isBuffering,
    hasError: audioError,
    canSetVolume,
    playbackMode,
    playbackRate,
    updateCurrentTime,
    togglePlay,
    retry: retryAudio,
    setPlaybackMode,
    setPlaybackRate,
    handleSeek,
    handleVolumeChange,
  } = useLocalAudioPlayer(track?.url, {
    autoPlay: autoPlay || isPlayAll,
    // Nothing to do after the last song, so playback stops there
    onPlayNext: () => goToSong(nextSong, true),
  });

  useEffect(() => {
    if (isPlayAll) setPlaybackMode("next");
  }, [isPlayAll, setPlaybackMode]);

  const formattedVoice = voice
    ? voice.charAt(0).toUpperCase() + voice.slice(1)
    : "";

  // The browser ignores the `download` attribute on cross-origin links, so the
  // file is fetched and re-served as a same-origin blob URL. This depends on
  // the R2 bucket allowing cross-origin GETs.
  const handleDownloadMp3 = async () => {
    if (!song || !track || isDownloading) return;

    setIsDownloading(true);

    try {
      const response = await fetch(track.url);

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const downloadLink = document.createElement("a");

      downloadLink.href = objectUrl;
      downloadLink.download = `${song.title} - ${formattedVoice}.mp3`;
      downloadLink.click();

      // Revoked right after the click, Safari may cancel the download
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      toast.success("Download concluído");
    } catch (error) {
      console.error("Failed to download track", error);
      toast.error("Não foi possível baixar o arquivo");
    } finally {
      setIsDownloading(false);
    }
  };

  const hasLyrics = Boolean(song?.lyrics.lines.length);

  const handleCopyLyric = async () => {
    if (!song || !hasLyrics) return;
    const fullText = song.lyrics.lines.map((line) => line.text).join("\n");
    // Resolves false when the browser refuses, rather than rejecting
    if (await copyToClipboard(fullText)) {
      toast.success("Letra copiada");
    } else {
      toast.error("Não foi possível copiar a letra");
    }
  };

  // Offline, a kit that isn't saved fails to load, and retrying can't help
  const audioUnavailableOffline =
    Boolean(track) && !isAvailableOffline && !online;

  return (
    <Layout submenu title={song ? `${song.title} | CJL` : undefined}>
      <div className="h-full w-full flex flex-col content-center gap-4">
        <div className="h-full min-h-0 w-full p-5 flex flex-col gap-3 rounded-3xl bg-gray-800">
          <div className="w-full grid place-items-center">
            <div className="w-full flex items-center justify-between">
              <Link
                href={voice ? `/kits/${voice}` : "/kits"}
                aria-label="Voltar"
                className="p-2 -m-2"
              >
                <CaretLeft size={32} weight="bold" />
              </Link>
              {loading ? (
                // One line of the title's height, like the lyric's placeholder
                // (which tells screen readers the page is loading)
                <div
                  aria-hidden
                  className="w-full h-9 text-3xl flex items-center justify-center"
                >
                  <div className="h-[0.75em] w-1/2 rounded-full bg-gray-700 animate-pulse" />
                </div>
              ) : (
                <h2 className="w-full text-center text-3xl font-bold text-gray-50">
                  {song?.title}
                </h2>
              )}
              <div className="w-8">
                <TextSettingsDropdown
                  enableReading={enableReading}
                  textAlign={textAlign}
                  fontSize={fontSize}
                  onToggleReading={() => setEnableReading((prev) => !prev)}
                  onChangeTextAlign={(align) => setTextAlign(align)}
                  onDownloadMp3={handleDownloadMp3}
                  canDownloadMp3={Boolean(track)}
                  downloadingMp3={isDownloading}
                  onChangeFontSize={(size) => setFontSize(size)}
                  playbackRate={playbackRate}
                  onChangePlaybackRate={setPlaybackRate}
                  onCopyLyrics={handleCopyLyric}
                  canCopyLyrics={hasLyrics}
                  offlineSaved={isAvailableOffline}
                  offlineSaving={isSaving}
                  onToggleOffline={toggleOffline}
                />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-100">
              {formattedVoice}
            </h3>
          </div>

          {loading && <LyricsPlaceholder />}

          {(error || isTrackUnavailable) && (
            <div className="text-center">
              {error && (
                <LoadError
                  message={error}
                  onRetry={canRetry ? () => mutate() : undefined}
                  retrying={isValidating}
                />
              )}
              {isTrackUnavailable && (
                <p className="text-gray-100">
                  Kit de voz indisponível para esta música.
                </p>
              )}
            </div>
          )}

          {/* Before the kit has failed to load; after, the player says it */}
          {audioUnavailableOffline && !audioError && (
            <p className="text-center text-red-500">
              Áudio não disponível offline
            </p>
          )}

          {song && (
            <TextReader
              // A new song starts at the top, following its lyric
              key={song.id}
              lyrics={song.lyrics}
              currentTime={currentTime}
              enableReading={enableReading}
              updateCurrentTime={updateCurrentTime}
              textAlign={textAlign}
              fontSize={fontSize}
            />
          )}
        </div>

        {!isTrackUnavailable && (
          <div className="w-full p-5 rounded-3xl bg-gray-800 flex flex-col gap-4">
            {/* The controls stay, to move on to another song */}
            {audioError && (
              <LoadError
                message={
                  audioUnavailableOffline
                    ? "Áudio não disponível offline."
                    : "Não foi possível carregar o áudio."
                }
                onRetry={audioUnavailableOffline ? undefined : retryAudio}
              />
            )}
            <SongPlayer
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              canSetVolume={canSetVolume}
              togglePlay={togglePlay}
              playbackMode={playbackMode}
              setPlaybackMode={setPlaybackMode}
              handleSeek={handleSeek}
              volume={volume}
              handleVolumeChange={handleVolumeChange}
              onPrevious={() => goToSong(previousSong, isPlaying)}
              onNext={() => goToSong(nextSong, isPlaying)}
              hasPrevious={Boolean(previousSong)}
              hasNext={Boolean(nextSong)}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
