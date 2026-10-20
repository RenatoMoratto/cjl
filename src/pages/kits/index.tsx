import Layout from "@/components/Layout";
import Image from "next/image";
import Link from "next/link";
import contralto from "../../../public/images/contralto.webp";
import soprano from "../../../public/images/soprano.webp";
import tenor from "../../../public/images/tenor.webp";
import baixo from "../../../public/images/baixo.webp";
import todos from "../../../public/images/todos.webp";

const voices = [
  { id: 1, title: "Contralto", image: contralto, url: "contralto" },
  { id: 2, title: "Soprano", image: soprano, url: "soprano" },
  { id: 3, title: "Tenor", image: tenor, url: "tenor" },
  { id: 4, title: "Baixo", image: baixo, url: "baixo" },
  { id: 5, title: "Todos", image: todos, url: "todos" },
];

export default function Kits() {
  return (
    <Layout title="Kits de Voz | CJL">
      <div className="h-full w-full content-center">
        <div className="w-full p-[20px] grid place-items-center gap-[16px] rounded-3xl bg-gray-800">
          <h2 className="text-3xl font-bold text-gray-50">Kits de Voz</h2>
          <div className="flex flex-wrap gap-2">
            {voices.map((voice, index) => {
              const isFullWidth =
                voices.length === 1 || index + 1 === voices.length;

              return (
                <Link
                  key={voice.id}
                  href={`/kits/${voice.url}`}
                  className="relative h-[120px] rounded-2xl overflow-hidden flex justify-center flex-grow"
                  style={{
                    minWidth: isFullWidth ? "100%" : "calc(50% - 0.5rem)",
                  }}
                >
                  <Image
                    src={voice.image}
                    alt=""
                    fill
                    priority
                    // The card's width inside the padded max-w-3xl container
                    sizes={
                      isFullWidth
                        ? "(max-width: 768px) calc(100vw - 80px), 688px"
                        : "(max-width: 768px) calc(50vw - 44px), 340px"
                    }
                    className="object-cover"
                  />
                  <div className="relative bg-black/60 h-full w-full p-6 flex justify-center items-center">
                    <p className="font-bold text-xl text-gray-50">
                      {voice.title}
                    </p>
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
