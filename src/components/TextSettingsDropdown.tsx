import {
  CaretDown,
  DotsThreeVertical,
  TextAlignCenter,
  TextAlignLeft,
  DownloadSimple,
  Copy,
  ProjectorScreen,
} from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";

const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 32;
const FONT_SIZE_STEP = 2;

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

// With the decimal comma: "0,75x"
const formatRate = (rate: number) => `${String(rate).replace(".", ",")}x`;

type TextSettingsDropdownProps = {
  enableReading: boolean;
  textAlign: "left" | "center";
  fontSize: number;
  playbackRate: number;
  onToggleReading: () => void;
  onChangeTextAlign: (align: "left" | "center") => void;
  onDownloadMp3: () => void;
  canDownloadMp3?: boolean;
  downloadingMp3?: boolean;
  onChangeFontSize: (size: number) => void;
  onChangePlaybackRate: (rate: number) => void;
  onCopyLyrics: () => void;
  /** False for a song without lyrics. */
  canCopyLyrics?: boolean;
  onPresent: () => void;
  /** False for a song without lyrics. */
  canPresent?: boolean;
  offlineSaved: boolean;
  offlineSaving: boolean;
  onToggleOffline: () => void;
};

type SwitchRowProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
};

// The row's label names the switch, so its state needs no extra text
const SwitchRow = ({
  label,
  description,
  checked,
  onChange,
}: SwitchRowProps) => (
  <label className="flex items-center justify-between gap-3 min-h-11 cursor-pointer">
    <span className="flex flex-col">
      <span>{label}</span>
      {description && (
        <span className="text-xs text-gray-400">{description}</span>
      )}
    </span>
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <span className="w-11 h-6 bg-gray-600 peer-focus-visible:ring-2 peer-focus-visible:ring-primary rounded-full peer-checked:bg-primary transition-all"></span>
      <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"></span>
    </span>
  </label>
);

const optionClass = (selected: boolean) =>
  `grid place-items-center w-10 h-9 rounded transition disabled:opacity-40 disabled:cursor-not-allowed ${
    selected ? "bg-gray-700 text-white" : "hover:bg-gray-700"
  }`;

const actionClass =
  "flex items-center gap-2 w-full min-h-11 text-left px-2 -mx-2 rounded hover:bg-gray-700 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed";

export default function TextSettingsDropdown({
  enableReading,
  textAlign,
  fontSize,
  playbackRate,
  onToggleReading,
  onChangeTextAlign,
  onDownloadMp3,
  canDownloadMp3 = true,
  downloadingMp3 = false,
  onChangeFontSize,
  onChangePlaybackRate,
  onCopyLyrics,
  canCopyLyrics = true,
  onPresent,
  canPresent = true,
  offlineSaved,
  offlineSaving,
  onToggleOffline,
}: TextSettingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const changeFontSize = (delta: number) =>
    onChangeFontSize(
      Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize + delta)),
    );

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        className="p-2 -m-2 text-gray-300 hover:text-white transition"
        aria-label="Mais opções"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <DotsThreeVertical size={28} weight="bold" />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-4rem)] bg-gray-900 border border-gray-700 shadow-lg py-1 px-4 rounded-lg z-10 text-sm text-gray-200"
        >
          <SwitchRow
            label="Letra sincronizada"
            checked={enableReading}
            onChange={onToggleReading}
          />

          <div className="flex items-center justify-between gap-3 min-h-11">
            <span>Tamanho do texto</span>
            <div className="flex gap-1">
              <button
                className={optionClass(false)}
                onClick={() => changeFontSize(-FONT_SIZE_STEP)}
                disabled={fontSize <= MIN_FONT_SIZE}
                aria-label="Diminuir texto"
              >
                A−
              </button>
              <button
                className={optionClass(false)}
                onClick={() => changeFontSize(FONT_SIZE_STEP)}
                disabled={fontSize >= MAX_FONT_SIZE}
                aria-label="Aumentar texto"
              >
                A+
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 min-h-11">
            <span>Alinhamento</span>
            <div className="flex gap-1">
              <button
                className={optionClass(textAlign === "left")}
                onClick={() => onChangeTextAlign("left")}
                aria-label="Alinhar à esquerda"
                aria-pressed={textAlign === "left"}
              >
                <TextAlignLeft size={20} weight="bold" />
              </button>
              <button
                className={optionClass(textAlign === "center")}
                onClick={() => onChangeTextAlign("center")}
                aria-label="Centralizar"
                aria-pressed={textAlign === "center"}
              >
                <TextAlignCenter size={20} weight="bold" />
              </button>
            </div>
          </div>

          <div className="border-t border-gray-700 my-1" />

          {/* The options open apart from the menu: the phone's own picker */}
          <label className="flex items-center justify-between gap-3 min-h-11">
            <span>Velocidade</span>
            {/* Its own arrow: the browser's sits against the border */}
            <span className="relative flex items-center">
              <select
                value={playbackRate}
                onChange={(event) =>
                  onChangePlaybackRate(Number(event.target.value))
                }
                className="appearance-none h-9 rounded border border-gray-700 bg-gray-800 pl-3 pr-8 text-gray-200 cursor-pointer focus:border-primary focus:outline-none"
              >
                {PLAYBACK_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {formatRate(rate)}
                  </option>
                ))}
              </select>
              <CaretDown
                size={14}
                weight="bold"
                aria-hidden
                className="pointer-events-none absolute right-2.5 text-gray-400"
              />
            </span>
          </label>

          <div className="border-t border-gray-700 my-1" />

          <SwitchRow
            label="Ouvir sem internet"
            description={offlineSaving ? "Salvando..." : undefined}
            checked={offlineSaved || offlineSaving}
            onChange={onToggleOffline}
          />

          {/* Stays open while downloading, so the progress shows */}
          <button
            onClick={onDownloadMp3}
            disabled={!canDownloadMp3 || downloadingMp3}
            className={actionClass}
          >
            <DownloadSimple size={20} />
            {downloadingMp3 ? "Baixando..." : "Baixar MP3"}
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onCopyLyrics();
            }}
            disabled={!canCopyLyrics}
            className={actionClass}
          >
            <Copy size={20} />
            Copiar letra
          </button>

          <button
            onClick={() => {
              setOpen(false);
              onPresent();
            }}
            disabled={!canPresent}
            className={actionClass}
          >
            <ProjectorScreen size={20} />
            Modo apresentação
          </button>
        </div>
      )}
    </div>
  );
}
