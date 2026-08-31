import { SignOut } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";
import { useDocumentTitle } from "usehooks-ts";

import CustomToastContainer from "@/components/CustomToastContainer";
import type { AdminIdentity } from "@/lib/auth/page";

/**
 * The shell every admin screen sits in.
 *
 * Separate from src/components/Layout.tsx rather than a variant of it: that one
 * is built around the chorister's phone — a max-w-3xl column and the bottom
 * navigation — and widening it or making the footer conditional would change
 * every public page to serve five admin ones. The visual language is
 * deliberately identical; only the width and the header differ.
 */

interface AdminLayoutProps {
  admin: AdminIdentity;
  title: string;
  /** Rendered at the top of the card, e.g. a back link or a save button. */
  actions?: ReactNode;
  children: ReactNode;
}

function AdminLayout({ admin, title, actions, children }: AdminLayoutProps) {
  useDocumentTitle(`${title} | Admin CJL`);

  return (
    <div className="min-h-dvh bg-[url(/images/coral.webp)] bg-no-repeat bg-cover bg-center bg-fixed">
      <div className="bg-black/60 min-h-dvh flex justify-center">
        <div className="max-w-6xl w-full container">
          <div className="w-full p-5 flex flex-col gap-5">
            <header className="w-full flex flex-wrap items-center justify-between gap-3">
              <Link href="/admin" className="flex items-center gap-3">
                <Image
                  src="/images/logo-branca.webp"
                  alt="Logo do Coral Jovem de Londrina"
                  className="w-auto"
                  style={{ height: "28px" }}
                  width={78}
                  height={28}
                />
                <span className="text-sm font-medium text-gray-300">
                  Administração
                </span>
              </Link>

              <div className="flex items-center gap-3">
                <span
                  className="hidden sm:inline text-sm text-gray-300"
                  title={admin.email}
                >
                  {admin.email}
                </span>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex items-center gap-1.5 rounded-xl bg-gray-800/80 px-3 py-2 text-sm text-gray-100 transition hover:bg-gray-700"
                >
                  <SignOut size={16} />
                  Sair
                </button>
              </div>
            </header>

            <CustomToastContainer />

            <main className="w-full flex flex-col gap-4 rounded-3xl bg-gray-800 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-gray-50">{title}</h1>
                {actions && (
                  <div className="flex flex-wrap items-center gap-2">
                    {actions}
                  </div>
                )}
              </div>

              {children}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
