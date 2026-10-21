import { DeviceMobile, Export } from "@phosphor-icons/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { InstallPlatform, useInstallApp } from "@/hooks/useInstallApp";

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
 * The home page's install button. Hidden when the site is already open as
 * the app; otherwise it opens the browser's own install dialog when there is
 * one, or the steps for this browser.
 */
export default function InstallApp() {
  const { status, promptInstall } = useInstallApp();
  const [open, setOpen] = useState(false);
  // Read when opening, since a dismissed prompt turns into the manual steps
  const [mode, setMode] = useState<"prompt" | InstallPlatform>("prompt");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (status === "hidden") return null;

  const install = async () => {
    // The browser's dialog takes over from here
    setOpen(false);
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("App instalado");
  };

  const manual = mode === "prompt" ? null : manualSteps[mode];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode(status);
          setOpen(true);
        }}
        // Lighter than the other buttons: installing is optional
        className="mt-10 flex items-center justify-center gap-2 py-2 px-6 w-full md:w-max rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <DeviceMobile size={20} weight="bold" aria-hidden />
        Instalar app do CJL
      </button>

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
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
          <p className="text-sm text-gray-300">
            Acesse o CJL como um app, direto do seu celular ou computador. As
            músicas salvas em “Ouvir sem internet” tocam mesmo sem conexão.
          </p>

          {manual && (
            <div className="flex flex-col gap-2 text-sm text-gray-200">
              <ol className="list-decimal pl-5 flex flex-col gap-1">
                {manual.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              {manual.note && (
                <p className="text-xs text-gray-400">{manual.note}</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl bg-gray-700 px-4 py-2 text-sm transition hover:bg-gray-600"
            >
              {manual ? "Entendi" : "Agora não"}
            </button>
            {!manual && (
              <button
                type="button"
                onClick={install}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Instalar
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
