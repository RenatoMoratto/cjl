import Layout from "@/components/Layout";
import TextReader from "@/components/TextReader";
import { useLocalAudioPlayer } from "@/hooks/useLocalAudioPlayer";
import { CaretLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, lazy, Suspense } from "react";
import { isVoice, SongDetail } from "@/types";
import TextSettingsDropdown from "@/components/TextSettingsDropdown";
import { useCopyToClipboard, useLocalStorage } from "usehooks-ts";
import { toast } from "react-toastify";

// Lazy load SongPlayer to reduce initial bundle size
const SongPlayer = lazy(() => import("@/components/SongPlayer"));

export default function Musica() {
  const params = useParams();

  const [song, setSong] = useState<SongDetail>();
  const [enableReading, setEnableReading] = useLocalStorage(
    "enable-reading",
    true,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // A song may simply not have a kit for this voice — five of them have no
  // "todos" mix — and the URL segment itself is user-supplied.
  const track = song?.tracks.find((item) => item.voice === voice);
  const isTrackUnavailable = Boolean(song) && !track;

  const {
    volume,
    currentTime,
    duration,
    isPlaying,
    isReplayEnabled,
    updateCurrentTime,
    togglePlay,
    toggleReplay,
    handleSeek,
    handleVolumeChange,
  } = useLocalAudioPlayer(track?.url);

  const formattedVoice = voice
    ? voice.charAt(0).toUpperCase() + voice.slice(1)
    : "";

  useEffect(() => {
    const fetchMusica = async () => {
      try {
        setLoading(true);

        const response = await fetch(`/api/musicas/${songId}`);
        if (!response.ok) {
          throw new Error("Música não encontrada");
        }
        const data: SongDetail = await response.json();
        setSong(data);
        setError(null);
      } catch (error) {
        setError((error as Error).message);
      } finally {
        setLoading(false);
      }
    };

    if (songId) {
      fetchMusica();
    }
  }, [songId]);

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
    <Layout submenu title={song?.title + " | CJL"}>
      <div className="h-full w-full flex flex-col content-center gap-4">
        <div className="h-full w-full p-5 flex flex-col gap-3 rounded-3xl bg-gray-800 overflow-hidden">
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
                  canDownloadMp3={Boolean(track) && !isDownloading}
                  onChangeFontSize={(size) => setFontSize(size)}
                  onCopyLyrics={handleCopyLyric}
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
            <Suspense
              fallback={
                <div className="text-center text-gray-50">
                  Carregando player...
                </div>
              }
            >
              <SongPlayer
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
                togglePlay={togglePlay}
                isReplayEnabled={isReplayEnabled}
                toggleReplay={toggleReplay}
                handleSeek={handleSeek}
                volume={volume}
                handleVolumeChange={handleVolumeChange}
              />
            </Suspense>
          </div>
        )}
      </div>
    </Layout>
  );
}
