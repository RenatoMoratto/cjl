/**
 * The SWR fetcher for the public read endpoints (/api/musicas, /api/agenda).
 *
 * Requests go through the service worker, which answers from its cache when
 * the network is down, so a failed fetch means nothing was cached either.
 * The two failures are told apart because the pages word them differently.
 */
export class FetchError extends Error {
  /** True when the request never reached the server. */
  readonly offline: boolean;
  /** The response's status, when there was one. */
  readonly status?: number;

  constructor(offline: boolean, message: string, status?: number) {
    super(message);
    this.name = "FetchError";
    this.offline = offline;
    this.status = status;
  }
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path).catch(() => {
    throw new FetchError(true, `No connection for ${path}`);
  });

  if (!response.ok) {
    throw new FetchError(
      false,
      `${path} answered ${response.status}`,
      response.status,
    );
  }

  return response.json();
}
