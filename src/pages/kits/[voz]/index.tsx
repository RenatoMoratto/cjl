import Image from "next/image";
import Layout from "@/components/Layout";
import { CaretLeft, CloudCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SongSummary } from "@/types";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useOfflineSongs } from "@/hooks/useOfflineSongs";

export default function Songs() {
  const params = useParams();

  const [songs, setSongs] = useState<Array<SongSummary>>([]);
  const [loading, setLoading] = useState(true);

  const voice = params?.voz ?? "";

  const { isSavedOffline } = useOfflineSongs(songs);

  const formattedVoice =
    voice?.at(0)?.toUpperCase() + voice?.toString().substring(1);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        setLoading(true);

        // Fails without a network only when nothing is cached
        const response = await fetch(`/api/musicas`).catch(() => {
          throw new Error("Sem conexão");
        });

        if (!response.ok) {
          throw new Error("Músicas não encontradas");
        }

        const data: Array<SongSummary> = await response.json();
        setSongs(data);
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchSongs();
  }, []);

  return (
    <Layout submenu title={`Músicas ${formattedVoice} | CJL`}>
      <div className="h-full w-full content-center">
        <div className="h-full w-full p-5 flex flex-col rounded-3xl bg-gray-800">
          <div className="w-full grid place-items-center mb-4">
            <div className="w-full flex items-center justify-between">
              <Link href="/kits">
                <CaretLeft size={32} weight="bold" />
              </Link>
              <h2 className="w-full text-center text-3xl font-bold text-gray-50">
                Músicas
              </h2>
              <div className="w-[32px]" />
            </div>
            <h3 className="text-xl text-gray-100">{formattedVoice}</h3>
          </div>
          <div className="w-full flex flex-col gap-3 overflow-y-auto">
            {loading && <p className="text-gray-50">Carregando...</p>}

            {!loading &&
              songs
                // Hide songs without a kit for this voice (lists cached before
                // voices were returned have none, so they show everything)
                .filter(
                  (song) =>
                    !song.voices || song.voices.some((item) => item === voice),
                )
                .map((song) => {
                  const savedOffline = isSavedOffline(
                    song.id,
                    voice.toString(),
                  );

                  return (
                    <Link
                      key={song.id}
                      href={
                        voice && song.id ? `/kits/${voice}/${song.id}` : "/kits"
                      }
                      className={
                        !savedOffline && !navigator.onLine ? "opacity-50" : ""
                      }
                    >
                      <div className="bg-gray-700 w-full h-20 rounded-xl flex gap-2">
                        <Image
                          src={song.imageUrl}
                          alt={`Foto da Música ${song.title}`}
                          width={100}
                          height={80}
                          className="rounded-xl h-100 object-cover"
                        />
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
