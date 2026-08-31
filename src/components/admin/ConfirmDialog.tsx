import { useEffect, useRef } from "react";

/**
 * Confirmation for an action that cannot be undone from the UI.
 *
 * Uses a native <dialog>, so focus trapping, Escape and the backdrop come from
 * the browser rather than from hand-written key handling.
 */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What exactly is about to happen, including anything deferred. */
  description: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="rounded-2xl bg-gray-800 p-0 text-gray-100 backdrop:bg-black/70 open:flex max-w-md w-[calc(100%-2rem)]"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold text-gray-50">{title}</h2>
        <div className="text-sm text-gray-300">{description}</div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl bg-gray-700 px-4 py-2 text-sm transition hover:bg-gray-600 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Removendo..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default ConfirmDialog;
