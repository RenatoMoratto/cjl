import {
  CalendarBlank,
  HouseSimple,
  MicrophoneStage,
} from "@phosphor-icons/react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode } from "react";
import CustomToastContainer from "./CustomToastContainer";
// Static imports get hashed, immutably cached URLs and responsive AVIF sizes
import coral from "../../public/images/coral.webp";
import logo from "../../public/images/logo.webp";
import logoBranca from "../../public/images/logo-branca.webp";

const menuItems = [
  { title: "Home", icon: HouseSimple, link: "/" },
  { title: "Kits", icon: MicrophoneStage, link: "/kits" },
  { title: "Agenda", icon: CalendarBlank, link: "/agenda" },
];

function Layout({
  submenu = false,
  title = "Coral Jovem de Londrina",
  children,
}: {
  submenu?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="relative h-dvh">
      {/* In the server HTML too, unlike a title set from an effect */}
      <Head>
        <title>{title}</title>
      </Head>
      {/* Outside the column, where it would add an empty gap under the logo */}
      <CustomToastContainer />
      <Image
        src={coral}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="relative bg-black/60 h-full flex justify-center items-center">
        <div className="max-w-3xl container h-full">
          <div className="w-full h-full p-5 flex flex-col items-center gap-3">
            <header className="w-full flex justify-center">
              <Link href="/">
                <Image
                  src={submenu ? logoBranca : logo}
                  alt="Logo do Coral Jovem de Londrina"
                  className="w-auto"
                  style={{ height: submenu ? "28px" : "44px" }}
                  width={submenu ? "78" : "107"}
                  height={submenu ? "28" : "44"}
                />
              </Link>
            </header>

            <main className="flex-1 w-full flex overflow-auto">{children}</main>

            {!submenu && (
              <footer className="w-full mt-2 bg-gray-900 rounded-3xl flex">
                {menuItems.map((item) => {
                  const IconComponent = item.icon;

                  return (
                    <Link
                      key={item.link}
                      href={item.link}
                      className={`w-full flex flex-col items-center justify-items-center gap-1 px-1 py-3 ${
                        router.pathname === item.link ? "active" : ""
                      }`}
                    >
                      <IconComponent
                        weight={
                          router.pathname === item.link ? "fill" : "regular"
                        }
                        size={24}
                      />
                      <p
                        className={
                          router.pathname === item.link ? "font-bold" : ""
                        }
                      >
                        {item.title}
                      </p>
                    </Link>
                  );
                })}
              </footer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Layout;
