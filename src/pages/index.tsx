import Layout from "@/components/Layout";
import {
  InstagramLogo,
  WhatsappLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";
import Link from "next/link";

const socialMediaLinks = [
  {
    icon: YoutubeLogo,
    link: "https://www.youtube.com/@coraljovemdelondrina",
  },
  {
    icon: InstagramLogo,
    link: "https://www.instagram.com/coraljovemdelondrina/",
  },
  {
    icon: WhatsappLogo,
    link: "https://wa.me/5543991956641?text=Olá%2C%20gostaria%20de%20falar%20com%20o%20Coral%20Jovem%20de%20Londrina",
  },
];

export default function Home() {
  return (
    <Layout>
      <div className="h-full content-center">
        <h1 className="text-5xl font-bold text-gray-50">
          Coral Jovem de Londrina
        </h1>
        <p className="text-2xl text-gray-300 mt-1">
          Com fé e propósito, damos voz à nossa missão. A mensagem do advento a
          todo mundo em nossa geração.
        </p>

        <div className="flex flex-col md:flex-row mt-[40px] gap-[10px]">
          <Link href="/kits">
            <button className="bg-primary hover:bg-primary text-white py-2 px-8 w-full md:w-max rounded-full">
              Kits de Voz
            </button>
          </Link>
          <div className="flex flex-row justify-center gap-[10px]">
            {socialMediaLinks.map((socialMedia, index) => (
              <Link key={index} href={socialMedia.link} target="__blank">
                <button className="bg-secondary hover:bg-secondary text-white py-2 px-4 w-full md:w-max rounded-full">
                  <socialMedia.icon size={24} />
                </button>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
