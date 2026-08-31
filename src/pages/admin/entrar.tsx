import { GoogleLogo, SignOut, Warning } from "@phosphor-icons/react";
import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

import Layout from "@/components/Layout";
import { isAdminApiEnabled, isAllowedAdminEmail } from "@/lib/auth/admins";
import { authOptions } from "@/lib/auth/options";
import { safeAdminPath } from "@/lib/auth/paths";

/**
 * The sign-in screen.
 *
 * Deliberately does NOT use withAdminPage: that guard redirects anyone without
 * a session here, so guarding this page with it would loop.
 */

interface EntrarProps {
  /** Already-translated reason the last attempt failed, if there was one. */
  error: string | null;
  /** Set when a Google session exists but is not on the allowlist. */
  signedInAs: string | null;
  callbackUrl: string;
}

/**
 * NextAuth reports failures as codes in the query string. Everything a choir
 * coordinator can actually encounter gets its own sentence; the rest collapses
 * to one honest fallback rather than leaking a code they cannot act on.
 */
function translateError(code: string | undefined): string | null {
  if (!code) return null;

  switch (code) {
    case "AccessDenied":
      return "Esta conta do Google não tem acesso à administração.";
    case "OAuthSignin":
    case "OAuthCallback":
    case "Callback":
      return "Não foi possível concluir o login com o Google. Tente novamente.";
    case "Configuration":
      return "O login não está configurado neste ambiente.";
    case "SessionRequired":
      return "Entre para continuar.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
}

export default function Entrar({
  error,
  signedInAs,
  callbackUrl,
}: EntrarProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Layout submenu title="Entrar | CJL">
      <div className="h-full w-full content-center">
        <div className="w-full max-w-md mx-auto p-6 flex flex-col gap-5 rounded-3xl bg-gray-800">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-gray-50">Administração</h1>
            <p className="text-sm text-gray-300">
              Entre com a conta do Google autorizada para gerenciar músicas,
              kits de voz e letras.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-primary/15 border border-primary/40 px-3 py-2 text-sm text-gray-100"
            >
              <Warning size={18} weight="fill" className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              signIn("google", { callbackUrl });
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            <GoogleLogo size={20} weight="bold" />
            {busy ? "Abrindo o Google..." : "Entrar com o Google"}
          </button>

          {signedInAs && (
            <div className="flex flex-col gap-2 border-t border-gray-700 pt-4">
              <p className="text-sm text-gray-300">
                Você está conectado como{" "}
                <span className="font-medium text-gray-100">{signedInAs}</span>.
                Se essa não é a conta autorizada, saia e entre com a outra.
              </p>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/admin/entrar" })}
                className="flex items-center justify-center gap-2 rounded-xl bg-gray-700 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-600"
              >
                <SignOut size={18} />
                Sair e usar outra conta
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export const getServerSideProps: GetServerSideProps<EntrarProps> = async (
  ctx,
) => {
  ctx.res.setHeader("Cache-Control", "no-store");

  // With the surface switched off there is nothing to sign in to, and the 404
  // matches what every /api/admin route answers.
  if (!isAdminApiEnabled()) return { notFound: true };

  const callbackUrl = safeAdminPath(ctx.query.callbackUrl);
  const session = await getServerSession(ctx.req, ctx.res, authOptions());
  const email = session?.user?.email ?? null;

  if (email && isAllowedAdminEmail(email)) {
    return { redirect: { destination: callbackUrl, permanent: false } };
  }

  const errorCode = Array.isArray(ctx.query.error)
    ? ctx.query.error[0]
    : ctx.query.error;

  return {
    props: {
      // A session that got this far is one the allowlist no longer accepts,
      // which the generic message would describe misleadingly.
      error: translateError(email ? "AccessDenied" : errorCode),
      signedInAs: email,
      callbackUrl,
    },
  };
};
