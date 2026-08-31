import { ArrowLeft, TextAlignLeft } from "@phosphor-icons/react";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import AdminLayout from "@/components/admin/AdminLayout";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import SongForm, { type SongFormValues } from "@/components/admin/SongForm";
import VoiceKitSlot, {
  type VoiceSlotData,
} from "@/components/admin/VoiceKitSlot";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { useTrackUpload } from "@/hooks/useTrackUpload";
import { adminApi, ApiError, isUnauthenticated } from "@/lib/api/client";
import { withAdminPage } from "@/lib/auth/page";
import { VOICES, type SongDetail, type Voice } from "@/types";

/**
 * Edit a song's metadata and its voice kits.
 *
 * Two endpoints are read, on purpose. GET /api/admin/songs carries each track's
 * id — needed to delete one — but no playable URL; GET /api/admin/songs/:id
 * composes the URLs but drops the ids. Merging them by voice here is cheaper
 * than widening either response, and it keeps the public audio host out of the
 * browser's hands except as an already-composed URL.
 */

interface LoadedSong {
  detail: SongDetail;
  slots: VoiceSlotData[];
}

export default function EditarMusica({
  admin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const songId = Number(router.query.id);

  const [loaded, setLoaded] = useState<LoadedSong | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<VoiceSlotData | null>(
    null,
  );
  const { errors, fieldError, capture, clear } = useFieldErrors();

  const load = useCallback(async () => {
    if (!Number.isInteger(songId) || songId <= 0) return;

    setLoadError(null);

    try {
      const [detail, managed] = await Promise.all([
        adminApi.getSong(songId),
        adminApi.listSongs(),
      ]);

      const managedSong = managed.find((song) => song.id === songId);

      setLoaded({
        detail,
        slots: VOICES.map((voice) => ({
          voice,
          trackId: managedSong?.tracks.find((t) => t.voice === voice)?.id,
          objectKey: managedSong?.tracks.find((t) => t.voice === voice)
            ?.objectKey,
          url: detail.tracks.find((t) => t.voice === voice)?.url,
        })),
      });
    } catch (error) {
      if (isUnauthenticated(error)) {
        window.location.href = `/admin/entrar?callbackUrl=${encodeURIComponent(router.asPath)}`;
        return;
      }

      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível carregar a música.",
      );
    }
  }, [songId, router.asPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const { states, start, cancel, reset } = useTrackUpload(songId, () => {
    void load();
    toast.success("Kit de voz enviado.");
  });

  // Re-picking the same file after a failure needs the last one remembered.
  const [lastFile, setLastFile] = useState<Partial<Record<Voice, File>>>({});

  async function save(
    _values: SongFormValues,
    changed: Partial<SongFormValues>,
  ) {
    setBusy(true);
    clear();

    try {
      // Only what changed: the schema rejects an empty patch, and resending
      // untouched values would bump updatedAt and purge the public cache for
      // nothing.
      const updated = await adminApi.updateSong(songId, changed);
      setLoaded((current) =>
        current ? { ...current, detail: updated } : current,
      );
      toast.success("Alterações salvas.");
    } catch (error) {
      capture(error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteKit() {
    if (!pendingDelete?.trackId) return;

    setBusy(true);

    try {
      await adminApi.deleteTrack(pendingDelete.trackId);
      toast.success("Kit removido. O arquivo sai do armazenamento em 7 dias.");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível remover o kit.",
      );
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  const hasTracks = loaded?.slots.some((slot) => slot.url) ?? false;

  return (
    <AdminLayout
      admin={admin}
      title={loaded ? loaded.detail.title : "Editar música"}
      actions={
        <>
          {loaded && (
            <Link
              href={`/admin/musicas/${songId}/letra`}
              className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <TextAlignLeft size={16} />
              Editar letra
            </Link>
          )}
          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-600"
          >
            <ArrowLeft size={16} />
            Voltar
          </Link>
        </>
      }
    >
      {loadError && (
        <p className="rounded-xl bg-primary/15 px-3 py-2 text-sm text-gray-100">
          {loadError}
        </p>
      )}

      {!loaded && !loadError && (
        <p className="text-sm text-gray-400">Carregando...</p>
      )}

      {loaded && (
        <>
          <SongForm
            key={loaded.detail.id}
            initial={{
              slug: loaded.detail.slug,
              title: loaded.detail.title,
              author: loaded.detail.author,
              imageUrl: loaded.detail.imageUrl,
              status: loaded.detail.status,
            }}
            submitLabel="Salvar alterações"
            busy={busy}
            serverFieldError={fieldError}
            formErrors={errors.form}
            hasTracks={hasTracks}
            onSubmit={save}
          />

          <section className="flex flex-col gap-3 border-t border-gray-700 pt-5">
            <div>
              <h2 className="text-lg font-semibold text-gray-50">
                Kits de voz
              </h2>
              <p className="text-xs text-gray-400">
                Arquivos MP3 de até 30 MB. Substituir um kit escreve um arquivo
                novo, então quem já ouviu o antigo recebe o novo assim mesmo.
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {loaded.slots.map((slot) => (
                <VoiceKitSlot
                  key={slot.voice}
                  slot={slot}
                  upload={states[slot.voice]}
                  onSelectFile={(file) => {
                    setLastFile((current) => ({
                      ...current,
                      [slot.voice]: file,
                    }));
                    void start(slot.voice, file);
                  }}
                  onCancel={() => cancel(slot.voice)}
                  onRetry={() => {
                    const file = lastFile[slot.voice];
                    if (file) void start(slot.voice, file);
                    else reset(slot.voice);
                  }}
                  onDelete={() => setPendingDelete(slot)}
                />
              ))}
            </ul>
          </section>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remover kit de voz"
        description={
          <>
            O kit de{" "}
            <strong className="text-gray-100">{pendingDelete?.voice}</strong>{" "}
            deixa de aparecer para os coralistas imediatamente. O arquivo sai do
            armazenamento após 7 dias.
          </>
        }
        confirmLabel="Remover"
        busy={busy}
        onConfirm={() => void deleteKit()}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminLayout>
  );
}

export const getServerSideProps = withAdminPage();
