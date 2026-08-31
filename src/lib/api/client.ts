import type { ApiError as ApiErrorBody } from "@/lib/api/admin";
import type { z } from "zod";

import type {
  ConfirmTrackUploadInput,
  createSongSchema,
  CreateUploadUrlInput,
  UpdateSongInput,
} from "@/lib/validation/songs";
// Type-only, and it must stay that way: a value import of these modules would
// pull drizzle, the S3 client and the Neon driver into the browser bundle.
import type { DeleteSongResult, ManagedSong } from "@/services/songs";
import type {
  ConfirmedTrack,
  DeleteTrackResult,
  PreparedTrackUpload,
} from "@/services/tracks";
import type { SongDetail } from "@/types";

/**
 * The browser's side of /api/admin.
 *
 * One place that knows how this API reports failure, so no screen has to
 * rediscover it. Three shapes reach the client and all three mean "your form
 * is wrong":
 *
 *   - 422 with `fields`, from a Zod failure, keyed by input path;
 *   - 422 without `fields`, from a ServiceError("invalid") such as a reorder
 *     whose id list has drifted from the database;
 *   - 409, from a duplicate slug, which is a field error the server has no way
 *     to label as one.
 *
 * ApiError carries all of them and lets the caller ask the question it
 * actually has: what is wrong with this field, and what is wrong overall.
 */

/** The bucket zod uses for object-level refinements, which are not one field. */
const FORM_ERROR_KEY = "_";

export class ApiError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(
    status: number,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }

  /** First message for one input, for display beside it. */
  fieldError(path: string): string | undefined {
    return this.fields?.[path]?.[0];
  }

  /**
   * Messages that belong above the form rather than beside an input: zod's
   * object-level refinements, plus the failures that arrive with no field at
   * all so would otherwise be shown nowhere.
   */
  formErrors(): string[] {
    const own = this.fields?.[FORM_ERROR_KEY] ?? [];

    if (own.length > 0) return own;
    if (this.fields && Object.keys(this.fields).length > 0) return [];

    return [this.message];
  }
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * A duplicate slug is the only conflict this API can raise: `slug` is the sole
 * unique index on `songs`. Reported as a field error so the form can highlight
 * the input the person actually has to change.
 */
export function conflictAsFieldErrors(
  error: ApiError,
): Record<string, string[]> {
  return { slug: [error.message] };
}

/** Fallbacks for a response whose body is not the JSON envelope, e.g. an HTML 500. */
function fallbackMessage(status: number): string {
  if (status >= 500) return "O servidor falhou. Tente novamente em instantes.";
  if (status === 401) return "Sua sessão expirou. Entre novamente.";
  if (status === 403) return "Esta conta não tem acesso à administração.";
  if (status === 404) return "Não encontrado.";

  return "Não foi possível concluir a operação.";
}

async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;

  const response = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: {
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });

  if (response.status === 204) return undefined as T;

  // Never render a body we did not produce: a proxy error or a framework crash
  // arrives as HTML, and putting that in a toast is worse than saying nothing.
  let body: ApiErrorBody | null = null;

  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? fallbackMessage(response.status),
      body?.fields,
    );
  }

  return body as T;
}

/**
 * ManagedSong over the wire.
 *
 * The service types `updatedAt` as a Date, which JSON cannot carry — importing
 * the service type unchanged would let TypeScript agree with a lie.
 */
export type ManagedSongResponse = Omit<ManagedSong, "updatedAt"> & {
  updatedAt: string;
};

/**
 * What the browser sends to create a song, which is not what the service
 * receives: createSongSchema defaults `lyrics` and `status`, so the input side
 * of the schema is the honest shape for a caller that omits them.
 */
export type CreateSongPayload = z.input<typeof createSongSchema>;

export const adminApi = {
  listSongs: () => apiFetch<ManagedSongResponse[]>("/api/admin/songs"),

  getSong: (id: number) => apiFetch<SongDetail>(`/api/admin/songs/${id}`),

  createSong: (input: CreateSongPayload) =>
    apiFetch<SongDetail>("/api/admin/songs", { method: "POST", json: input }),

  updateSong: (id: number, input: UpdateSongInput) =>
    apiFetch<SongDetail>(`/api/admin/songs/${id}`, {
      method: "PATCH",
      json: input,
    }),

  deleteSong: (id: number) =>
    apiFetch<DeleteSongResult>(`/api/admin/songs/${id}`, { method: "DELETE" }),

  /**
   * Always the complete list of ids, never a filtered view: the server rejects
   * an order that has drifted from the database, which is how a stale tab is
   * stopped from dropping a song it never saw to the end.
   */
  reorderSongs: (orderedIds: number[]) =>
    apiFetch<{ ordered: number }>("/api/admin/songs/reorder", {
      method: "POST",
      json: { orderedIds },
    }),

  createUploadUrl: (input: CreateUploadUrlInput) =>
    apiFetch<PreparedTrackUpload>("/api/admin/tracks/upload-url", {
      method: "POST",
      json: input,
    }),

  confirmTrack: (input: ConfirmTrackUploadInput) =>
    apiFetch<ConfirmedTrack>("/api/admin/tracks", {
      method: "POST",
      json: input,
    }),

  deleteTrack: (id: number) =>
    apiFetch<DeleteTrackResult>(`/api/admin/tracks/${id}`, {
      method: "DELETE",
    }),
};
