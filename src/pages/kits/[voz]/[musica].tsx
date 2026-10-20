import Layout from "@/components/Layout";
import TextReader from "@/components/TextReader";
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
  const [fontSize, setFontSize] = useLocalStorage("font-size", 22);
  const [isDownloading, setIsDownloading] = useState(false);
  const [, copyToClipboard] = useCopyToClipboard();

  const rawVoice = Array.isArray(params?.voz) ? params.voz[0] : params?.voz;
  const voice = rawVoice && isVoice(rawVoice) ? rawVoice : undefined;
  const songId = Number(params?.musica ?? "");

  // The params are empty until the router is ready, so nothing is fetched yet
  const { data: song, error: fetchError } = useSWR<SongDetail, FetchError>(
    songId ? `/api/musicas/${songId}` : null,
  );
  const loading = !song && !fetchError;
  // Fails without a network only when the song isn't saved offline
  const error =
    fetchError && !song
      ? fetchError.offline
        ? "Música não disponível offline"
        : "Música não encontrada"
      : null;

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
    playbackMode,
    updateCurrentTime,
    togglePlay,
    setPlaybackMode,
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

      URL.revokeObjectURL(objectUrl);
      toast.success("Download concluído");
    } catch (error) {
      console.error("Failed to download track", error);
      toast.error("Não foi possível baixar o arquivo");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLyric = () => {
    if (!song) return;
    const fullText = song.lyrics.lines.map((line) => line.text).join("\n");
    copyToClipboard(fullText).then(() => toast.success("Letra copiada"));
  };

  return (
    <Layout submenu title={song ? `${song.title} | CJL` : undefined}>
      <div className="h-full w-full flex flex-col content-center gap-4">
        <div className="h-full min-h-0 w-full p-5 flex flex-col gap-3 rounded-3xl bg-gray-800">
          <div className="w-full grid place-items-center">
            <div className="w-full flex items-center justify-between">
              <Link href={voice ? `/kits/${voice}` : "/kits"}>
                <CaretLeft size={32} weight="bold" />
              </Link>
              <h2 className="w-full text-center text-3xl font-bold text-gray-50">
                {song?.title}
              </h2>
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
                  onCopyLyrics={handleCopyLyric}
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

          {(loading || error || isTrackUnavailable) && (
            <div className="text-center">
              {loading && <p className="text-gray-50">Carregando...</p>}
              {error && <p className="text-red-500">{error}</p>}
              {isTrackUnavailable && (
                <p className="text-gray-100">
                  Kit de voz indisponível para esta música.
                </p>
              )}
            </div>
          )}

          {track && !isAvailableOffline && !navigator.onLine && (
            <p className="text-center text-red-500">
              Áudio não disponível offline
            </p>
          )}

          {song && (
            <TextReader
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
          <div className="w-full p-5 rounded-3xl bg-gray-800">
            <SongPlayer
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
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
