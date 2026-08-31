import {
  DotsThreeVertical,
  TextAlignCenter,
  TextAlignLeft,
  DownloadSimple,
  Copy,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type TextSettingsDropdownProps = {
  enableReading: boolean;
  textAlign: "left" | "center";
  fontSize: number;
  onToggleReading: () => void;
  onChangeTextAlign: (align: "left" | "center") => void;
  onDownloadMp3: () => void;
  canDownloadMp3?: boolean;
  onChangeFontSize: (size: number) => void;
  onCopyLyrics: () => void;
};

export default function TextSettingsDropdown({
  enableReading,
  textAlign,
  fontSize,
  onToggleReading,
  onChangeTextAlign,
  onDownloadMp3,
  canDownloadMp3 = true,
  onChangeFontSize,
  onCopyLyrics,
}: TextSettingsDropdownProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="text-gray-300 hover:text-white transition"
      >
        <DotsThreeVertical size={28} weight="bold" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 shadow-lg p-2 px-4 rounded-lg z-10 text-sm text-gray-200">
          <div className="py-1 text-xs uppercase text-gray-200">
            Acompanhar letra
          </div>

          <label className="relative inline-flex items-center cursor-pointer gap-2">
            <input
              type="checkbox"
              checked={enableReading}
              onChange={() => onToggleReading()}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:bg-primary transition-all"></div>
            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-full transition-transform"></div>
            <span className="text-sm font-medium text-white">
              {enableReading ? "Sim" : "Não"}
            </span>
          </label>

          <div className="border-t border-gray-700 my-2" />

          <div className="py-1 text-xs uppercase text-gray-200">
            Alinhamento
          </div>

          <div className="flex gap-1 mb-2">
            <button
              className={`text-center px-2 py-1 rounded ${
                textAlign === "left"
                  ? "bg-gray-700 text-white"
                  : "hover:bg-gray-700"
              }`}
              onClick={() => onChangeTextAlign("left")}
            >
              <TextAlignLeft size={28} weight="bold" />
            </button>
            <button
              className={`text-center px-2 py-1 rounded ${
                textAlign === "center"
                  ? "bg-gray-700 text-white"
                  : "hover:bg-gray-700"
              }`}
              onClick={() => onChangeTextAlign("center")}
            >
              <TextAlignCenter size={28} weight="bold" />
            </button>
          </div>

          <div className="border-t border-gray-700 my-2" />

          <div className="py-1 text-xs uppercase text-gray-200">
            Tamanho da Letra
          </div>

          <div className="flex gap-1 mb-2">
            <input
              type="range"
              min={16}
              max={32}
              step={2}
              value={fontSize}
              onChange={(e) => onChangeFontSize(Number(e.target.value))}
              className="w-36 h-1 appearance-none accent-primary"
              style={{
                background: `linear-gradient(to right, var(--color-primary) ${
                  ((fontSize - 16) / (32 - 16)) * 100
                }%, #D1D5DB ${((fontSize - 16) / (32 - 16)) * 100}%)`,
              }}
            />
          </div>

          <div className="border-t border-gray-700 my-2" />

          <button
            onClick={onDownloadMp3}
            disabled={!canDownloadMp3}
            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-gray-700 transition disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <DownloadSimple size={20} />
            Baixar MP3
          </button>

          <div className="border-t border-gray-700 my-2" />

          <button
            onClick={onCopyLyrics}
            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-gray-700 transition"
          >
            <Copy size={20} />
            Copiar Letra
          </button>
        </div>
      )}
    </div>
  );
}
