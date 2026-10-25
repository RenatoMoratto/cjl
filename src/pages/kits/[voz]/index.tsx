import Image from "next/image";
import Layout from "@/components/Layout";
import { CaretLeft, CloudCheck, PlayCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SongSummary } from "@/types";
import useSWR from "swr";
import LoadError from "@/components/LoadError";
import { useOfflineSongs } from "@/hooks/useOfflineSongs";
import { useOnline } from "@/hooks/useOnline";
import { FetchError } from "@/lib/fetcher";
import { songsForVoice } from "@/lib/songs";

const NO_SONGS: SongSummary[] = [];

export default function Songs() {
  const params = useParams();

  // One cache entry for every voice, so switching voices or coming back from
  // a song shows the list at once while it is reloaded
  const {
    data,
    error,
    isLoading: loading,
    isValidating,
    mutate,
  } = useSWR<SongSummary[], FetchError>("/api/musicas");
  const songs = data ?? NO_SONGS;
  const online = useOnline();

  const voice = params?.voz ?? "";
  const voiceSongs = songsForVoice(songs, voice.toString());

  const { isSavedOffline } = useOfflineSongs(songs);

  // Empty in the prerendered page, which has no voice yet
  const formattedVoice = voice
    ? voice.at(0)?.toUpperCase() + voice.toString().substring(1)
    : "";

  return (
    <Layout
      submenu
      // The prerendered page is shared by every voice, so it has none yet
      title={voice ? `Músicas ${formattedVoice} | CJL` : "Músicas | CJL"}
    >
      <div className="h-full w-full content-center">
        <div className="h-full w-full p-5 flex flex-col rounded-3xl bg-gray-800">
          <div className="w-full grid place-items-center mb-4">
            <div className="w-full flex items-center justify-between">
              <Link href="/kits" aria-label="Voltar" className="p-2 -m-2">
                <CaretLeft size={32} weight="bold" />
              </Link>
              <h2 className="w-full text-center text-3xl font-bold text-gray-50">
                Músicas
              </h2>
              {voice && voiceSongs.length > 0 ? (
                // The song page starts playing and moves on to each next song
                <Link
                  href={`/kits/${voice}/${voiceSongs[0].id}?tocar=todas`}
                  aria-label="Tocar todas"
                  title="Tocar todas"
                >
                  <PlayCircle size={32} weight="bold" />
                </Link>
              ) : (
                <div className="w-[32px]" />
              )}
            </div>
            {/* Keeps its line while the voice is unknown */}
            <h3 className="text-xl text-gray-100 min-h-7">{formattedVoice}</h3>
          </div>
          <div className="w-full flex flex-col gap-3 overflow-y-auto">
            {/* A retry keeps the error up, with the button saying so */}
            {loading && !error && (
              // Rows of the list's own size, so it does not jump when it loads
              <div role="status" className="flex flex-col gap-3">
                <span className="sr-only">Carregando...</span>
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="bg-gray-700 w-full min-h-20 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            )}

            {/* Offline, the list is answered from the cache, so this means
                it was never loaded on this device */}
            {error && !data && (
              <div className="py-6">
                <LoadError
                  message={
                    error.offline
                      ? "Sem conexão. A lista de músicas aparece aqui quando você estiver online."
                      : "Não foi possível carregar as músicas."
                  }
                  onRetry={() => mutate()}
                  retrying={isValidating}
                />
              </div>
            )}

            {/* Not before the router has the voice */}
            {data && voice && voiceSongs.length === 0 && (
              <p className="py-6 text-center text-gray-100">
                Nenhuma música disponível para esta voz.
              </p>
            )}

            {!loading &&
              voiceSongs.map((song) => {
                const savedOffline = isSavedOffline(song.id, voice.toString());

                return (
                  <Link
                    key={song.id}
                    href={
                      voice && song.id ? `/kits/${voice}/${song.id}` : "/kits"
                    }
                    className={!savedOffline && !online ? "opacity-50" : ""}
                  >
                    <div className="bg-gray-700 w-full min-h-20 rounded-xl flex gap-2">
                      {/* Fills the row, which grows when the title wraps */}
                      <div className="relative w-[100px] shrink-0">
                        <Image
                          src={song.imageUrl}
                          // The title is next to it
                          alt=""
                          fill
                          sizes="100px"
                          className="rounded-xl object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-xl text-gray-50">{song.title}</p>
                        <p className="text-xs text-gray-100 overflow-hidden text-ellipsis">
                          {song.author}
                        </p>
                      </div>
                      {savedOffline && (
                        <CloudCheck
                          size={24}
                          className="m-3 shrink-0 text-gray-100"
                          aria-label="Disponível offline"
                        />
                      )}
                    </div>
                  </Link>
                );
              })}
          </div>
        </div>
      </div>
    </Layout>
  );
}
