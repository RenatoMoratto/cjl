import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";

import {
  ApiError,
  conflictAsFieldErrors,
  isUnauthenticated,
} from "@/lib/api/client";

/**
 * Turns whatever /api/admin threw into something a form can render.
 *
 * Collects the three failure shapes the API can produce into one place so no
 * screen has to branch on status codes: field messages land beside their
 * inputs, everything else lands above the form or in a toast.
 */

export interface FieldErrors {
  /** Messages keyed by input path, as the server reports them. */
  fields: Record<string, string[]>;
  /** Messages that belong to the form as a whole. */
  form: string[];
}

const EMPTY: FieldErrors = { fields: {}, form: [] };

export function useFieldErrors() {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>(EMPTY);

  const clear = useCallback(() => setErrors(EMPTY), []);

  /**
   * Returns true when the error was shown on the form, false when it was not a
   * form problem at all and the caller should handle it (a 404 after a song was
   * deleted in another tab, say).
   */
  const capture = useCallback(
    (error: unknown): boolean => {
      if (!(error instanceof ApiError)) {
        toast.error("Não foi possível concluir a operação.");
        return false;
      }

      // A dead session cannot be fixed on this screen. Send them to sign in and
      // bring them back where they were.
      if (isUnauthenticated(error)) {
        void router.replace(
          `/admin/entrar?callbackUrl=${encodeURIComponent(router.asPath)}`,
        );
        return true;
      }

      // The only unique index on songs is the slug, so a conflict is always
      // that field even though the server cannot say so.
      if (error.status === 409) {
        setErrors({ fields: conflictAsFieldErrors(error), form: [] });
        return true;
      }

      if (error.status === 422) {
        setErrors({ fields: error.fields ?? {}, form: error.formErrors() });
        return true;
      }

      toast.error(error.message);
      return false;
    },
    [router],
  );

  const fieldError = useCallback(
    (path: string) => errors.fields[path]?.[0],
    [errors],
  );

  return { errors, fieldError, capture, clear };
}
