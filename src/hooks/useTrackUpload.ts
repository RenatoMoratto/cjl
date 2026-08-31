import { useCallback, useRef, useState } from "react";

import { adminApi, ApiError } from "@/lib/api/client";
import { createUploadUrlSchema } from "@/lib/validation/songs";
import { VOICES, type Voice } from "@/types";

/**
 * The three-step voice-kit upload, as a state machine per voice.
 *
 * Audio never passes through the app: the server signs a PUT, the browser sends
 * the file straight to R2, and a third call records the row once the object
 * exists. Each voice runs independently, so five kits can upload at once.
 */

export type UploadPhase =
  | "idle"
  | "signing"
  | "uploading"
  | "confirming"
  | "error";

export interface UploadState {
  phase: UploadPhase;
  /** 0-100, meaningful only while uploading. */
  percent: number;
  message?: string;
}

const IDLE: UploadState = { phase: "idle", percent: 0 };

function initialStates(): Record<Voice, UploadState> {
  return Object.fromEntries(VOICES.map((voice) => [voice, IDLE])) as Record<
    Voice,
    UploadState
  >;
}

/** R2 answers failures with an XML document, which is not worth showing anyone. */
function describeUploadFailure(status: number): string {
  if (status === 0) return "Falha de rede durante o envio.";
  if (status === 403) return "O link de envio não foi aceito. Tente de novo.";

  return `O armazenamento recusou o envio (${status}).`;
}

interface PutArgs {
  url: string;
  file: File;
  headers: Record<string, string>;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
}

/**
 * XMLHttpRequest rather than fetch: only XHR reports upload progress, and a
 * 30 MB file over a phone connection with no progress bar looks like a hang.
 */
function putToStorage({
  url,
  file,
  headers,
  onProgress,
  signal,
}: PutArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("PUT", url, true);

    // Exactly the headers the server signed, verbatim and nothing else. These
    // are covered by the SigV4 signature, so altering one — sending the
    // browser's own idea of the file type, say, which Safari reports as
    // audio/mp3 — is a signature mismatch. Anything extra fails the bucket's
    // CORS preflight, which allows only these two header names.
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(describeUploadFailure(xhr.status)));

    xhr.onerror = () => reject(new Error(describeUploadFailure(0)));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    signal.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function useTrackUpload(songId: number, onUploaded: () => void) {
  const [states, setStates] =
    useState<Record<Voice, UploadState>>(initialStates);
  const controllers = useRef<Partial<Record<Voice, AbortController>>>({});

  const update = useCallback((voice: Voice, state: UploadState) => {
    setStates((current) => ({ ...current, [voice]: state }));
  }, []);

  const cancel = useCallback((voice: Voice) => {
    controllers.current[voice]?.abort();
  }, []);

  const start = useCallback(
    async (voice: Voice, file: File) => {
      // Checked here first so a wrong file is refused instantly, without a
      // round trip and without minting a presigned URL nobody will use. The
      // server checks the same schema, and R2's stored object is measured
      // again after the fact.
      const candidate = createUploadUrlSchema.safeParse({
        songId,
        voice,
        filename: file.name,
        // Safari sometimes reports an empty type for a picked MP3.
        contentType: file.type || "audio/mpeg",
        sizeBytes: file.size,
      });

      if (!candidate.success) {
        update(voice, {
          phase: "error",
          percent: 0,
          message: candidate.error.issues[0]?.message ?? "Arquivo inválido.",
        });
        return;
      }

      const controller = new AbortController();
      controllers.current[voice] = controller;

      try {
        update(voice, { phase: "signing", percent: 0 });

        let prepared = await adminApi.createUploadUrl(candidate.data);

        update(voice, { phase: "uploading", percent: 0 });

        try {
          await putToStorage({
            url: prepared.uploadUrl,
            file,
            headers: prepared.requiredHeaders,
            onProgress: (percent) =>
              update(voice, { phase: "uploading", percent }),
            signal: controller.signal,
          });
        } catch (error) {
          // A slow uplink can outlast the 15-minute signature, and the PUT then
          // fails only after the whole file has gone up. One fresh URL and one
          // retry, rather than making someone start over.
          const expired = Date.now() > Date.parse(prepared.expiresAt);

          if (!expired || controller.signal.aborted) throw error;

          update(voice, { phase: "signing", percent: 0 });
          prepared = await adminApi.createUploadUrl(candidate.data);

          update(voice, { phase: "uploading", percent: 0 });
          await putToStorage({
            url: prepared.uploadUrl,
            file,
            headers: prepared.requiredHeaders,
            onProgress: (percent) =>
              update(voice, { phase: "uploading", percent }),
            signal: controller.signal,
          });
        }

        update(voice, { phase: "confirming", percent: 100 });

        const confirmation = {
          songId,
          voice,
          objectKey: prepared.objectKey,
        };

        try {
          await adminApi.confirmTrack(confirmation);
        } catch (error) {
          // R2 is read-after-write consistent, so this should not happen; the
          // single cheap retry covers the case where it briefly does.
          if (error instanceof ApiError && error.status === 409) {
            await sleep(1000);
            await adminApi.confirmTrack(confirmation);
          } else {
            throw error;
          }
        }

        update(voice, IDLE);
        onUploaded();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          update(voice, IDLE);
          return;
        }

        update(voice, {
          phase: "error",
          percent: 0,
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível enviar o arquivo.",
        });
      } finally {
        delete controllers.current[voice];
      }
    },
    [songId, update, onUploaded],
  );

  const reset = useCallback((voice: Voice) => update(voice, IDLE), [update]);

  return { states, start, cancel, reset };
}
