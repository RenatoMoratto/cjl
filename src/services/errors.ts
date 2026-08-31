/**
 * Failures the services raise that a caller is expected to handle.
 *
 * Anything not represented here — a dropped Neon connection, an R2 outage — is
 * left to propagate as an ordinary Error and becomes a 500, because the caller
 * has no better response to it than "try again".
 */
export type ServiceErrorCode =
  /** The song or track does not exist. */
  | "not_found"
  /** A unique constraint would be violated, e.g. a slug already in use. */
  | "conflict"
  /** The input is well-formed but wrong for the current state of the data. */
  | "invalid"
  /** The client confirmed an upload whose object is not in the bucket. */
  | "upload_missing";

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  not_found: 404,
  conflict: 409,
  invalid: 422,
  upload_missing: 409,
};

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

/** Postgres unique_violation. Raised as a conflict rather than a 500. */
const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === UNIQUE_VIOLATION;
}
