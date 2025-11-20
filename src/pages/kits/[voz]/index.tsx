import Image from "next/image";
import Layout from "@/components/Layout";
import { CaretLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Song } from "@/types";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function Songs() {
  const params = useParams();

  const [songs, setSongs] = useState<Array<Song>>([]);
  const [loading, setLoading] = useState(true);

  const voice = params?.voz ?? "";

  const formattedVoice =
    voice?.at(0)?.toUpperCase() + voice?.toString().substring(1);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        setLoading(true);

        const response = await fetch(`/api/musicas`);

        if (!response.ok) {
          throw new Error("Músicas não encontradas");
        }

        const data: Array<Song> = await response.json();
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
              songs.map((song) => (
                <Link
                  key={song.id}
                  href={
                    voice && song.id ? `/kits/${voice}/${song.id}` : "/kits"
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
                    <div>
                      <p className="text-xl text-gray-50">{song.title}</p>
                      <p className="text-xs text-gray-100 overflow-hidden text-ellipsis">
                        {song.author}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
