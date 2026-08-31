import type { ReactNode } from "react";
import { useId } from "react";

/**
 * A labelled input with room for the server's own error message.
 *
 * Errors arrive from /api/admin keyed by input path, so a field only has to be
 * handed the messages for its own key — see useFieldErrors.
 */

interface FieldProps {
  label: string;
  /** Message shown beneath the control; also marks it invalid for a11y. */
  error?: string;
  /** Guidance shown when there is no error to show instead. */
  hint?: ReactNode;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => ReactNode;
}

export const CONTROL_CLASS =
  "w-full rounded-md border bg-gray-700 px-3 py-2 text-sm text-gray-50 transition focus:outline-none disabled:opacity-60";

function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-300">
        {label}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error || hint ? messageId : undefined,
        className: `${CONTROL_CLASS} ${
          error
            ? "border-primary focus:border-primary"
            : "border-gray-600 hover:border-gray-400 focus:border-primary"
        }`,
      })}

      {error ? (
        <p id={messageId} role="alert" className="text-xs text-primary">
          {error}
        </p>
      ) : (
        hint && (
          <p id={messageId} className="text-xs text-gray-400">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export default Field;
