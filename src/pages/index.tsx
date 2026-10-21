import InstallApp from "@/components/InstallApp";
import Layout from "@/components/Layout";
import {
  InstagramLogo,
  WhatsappLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";
import Link from "next/link";

const socialMediaLinks = [
  {
    label: "YouTube",
    icon: YoutubeLogo,
    link: "https://www.youtube.com/@coraljovemdelondrina",
  },
  {
    label: "Instagram",
    icon: InstagramLogo,
    link: "https://www.instagram.com/coraljovemdelondrina/",
  },
  {
    label: "WhatsApp",
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
          {/* Links styled as buttons: a button inside a link is two tab stops */}
          <Link
            href="/kits"
            className="bg-primary hover:brightness-110 active:brightness-90 transition text-white text-center py-2 px-8 w-full md:w-max rounded-full"
          >
            Kits de Voz
          </Link>
          <div className="flex flex-row justify-center gap-[10px]">
            {socialMediaLinks.map((socialMedia) => (
              <a
                key={socialMedia.label}
                href={socialMedia.link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={socialMedia.label}
                className="bg-secondary hover:brightness-110 active:brightness-90 transition text-white py-2 px-4 rounded-full flex justify-center"
              >
                <socialMedia.icon size={24} />
              </a>
            ))}
          </div>
        </div>

        <InstallApp />
      </div>
    </Layout>
  );
}
