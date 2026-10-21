import { WarningCircle } from "@phosphor-icons/react";

type LoadErrorProps = {
  message: string;
  /** Shows a retry button. */
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * Stands in for content that failed to load, so the page says what happened
 * instead of staying blank once the toast is gone.
 */
export default function LoadError({
  message,
  onRetry,
  retrying = false,
}: LoadErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 text-center text-gray-100"
    >
      <WarningCircle className="text-red-500" size={32} weight="bold" />
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="rounded-full border border-white/25 bg-white/10 px-5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
        >
          {retrying ? "Tentando..." : "Tentar novamente"}
        </button>
      )}
    </div>
  );
}
