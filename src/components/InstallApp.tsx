import { Export, X } from "@phosphor-icons/react";
import Image from "next/image";
import { ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useLocalStorage } from "usehooks-ts";
import { InstallPlatform, useInstallApp } from "@/hooks/useInstallApp";
import appIcon from "../../public/icons/icon-192.png";

const CLOSED_AT_KEY = "install-banner-closed-at";
const SHOW_AGAIN_AFTER = 30 * 24 * 60 * 60 * 1000; // 30 days

// Steps for browsers that install only from their own menus
const manualSteps: Record<
  InstallPlatform,
  { steps: ReactNode[]; note?: string }
> = {
  ios: {
    steps: [
      <>
        Toque em <strong>Compartilhar</strong>{" "}
        <Export size={18} className="inline align-text-bottom" aria-hidden />.
      </>,
      <>
        Toque em <strong>Adicionar à Tela de Início</strong>.
      </>,
    ],
    // The installed app does not share Safari's storage
    note: "Não encontrou a opção? Abra o site no Safari. Depois, salve no app as músicas que quiser ouvir sem internet.",
  },
  chromium: {
    steps: [
      <>Abra o menu do navegador (⋮ ou ⋯).</>,
      <>
        Escolha <strong>Instalar app</strong> ou{" "}
        <strong>Adicionar à tela inicial</strong>.
      </>,
    ],
    note: "Não encontrou a opção? O app talvez já esteja instalado.",
  },
  "safari-mac": {
    steps: [
      <>
        No menu <strong>Arquivo</strong>, escolha{" "}
        <strong>Adicionar ao Dock</strong>.
      </>,
    ],
    note: "Requer macOS Sonoma ou mais recente.",
  },
  "firefox-android": {
    steps: [
      <>Abra o menu do navegador (⋮).</>,
      <>
        Escolha <strong>Instalar</strong> ou{" "}
        <strong>Adicionar à tela inicial</strong>.
      </>,
    ],
  },
};

/**
 * The home page's install banner. Hidden when the site is already open as the
 * app, when the browser cannot install it, and for 30 days once the user is
 * done with it: closed, answered the browser's dialog or read the steps.
 */
export default function InstallApp() {
  const { status, promptInstall } = useInstallApp();
  const [closedAt, setClosedAt] = useLocalStorage<number | null>(
    CLOSED_AT_KEY,
    null,
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const recentlyClosed =
    closedAt !== null && Date.now() - closedAt < SHOW_AGAIN_AFTER;
  if (status === "hidden" || recentlyClosed) return null;

  const close = () => {
    setOpen(false);
    setClosedAt(Date.now());
  };

  const install = async () => {
    if (status !== "prompt") {
      setOpen(true);
      return;
    }

    const outcome = await promptInstall();
    // The prompt failed: the status is now this browser's steps
    if (outcome === "unavailable") {
      setOpen(true);
      return;
    }
    if (outcome === "accepted") toast.success("App instalado");
    close();
  };

  const manual = status === "prompt" ? null : manualSteps[status];

  return (
    <div className="mt-10 relative flex items-start gap-3 rounded-2xl border border-white/15 bg-gray-900/70 p-4 pr-12 backdrop-blur-sm md:max-w-md">
      <Image
        src={appIcon}
        alt=""
        width={48}
        height={48}
        className="shrink-0 rounded-xl"
      />
      <div className="flex-1">
        <p className="font-semibold text-gray-50">Instale o app do CJL</p>
        <p className="text-sm text-gray-300">
          Acesso rápido e músicas salvas offline.
        </p>
        <button
          type="button"
          onClick={install}
          className="mt-3 rounded-full border border-white/25 bg-white/10 px-5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          Instalar
        </button>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Fechar"
        className="absolute right-2 top-2 p-2 text-gray-400 transition hover:text-white"
      >
        <X size={20} weight="bold" />
      </button>

      {manual && (
        <dialog
          ref={ref}
          onClose={close}
          aria-labelledby="install-app-title"
          className="rounded-2xl bg-gray-800 p-0 text-gray-100 backdrop:bg-black/70 open:flex max-w-md w-[calc(100%-2rem)]"
        >
          <div className="flex flex-col gap-4 p-5">
            <h2
              id="install-app-title"
              className="text-lg font-semibold text-gray-50"
            >
              Instalar app do CJL
            </h2>
            <ol className="list-decimal pl-5 flex flex-col gap-1 text-sm text-gray-200">
              {manual.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
            {manual.note && (
              <p className="text-xs text-gray-400">{manual.note}</p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={close}
                className="rounded-xl bg-gray-700 px-4 py-2 text-sm transition hover:bg-gray-600"
              >
                Entendi
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
