import { ArrowClockwise, Plus } from "@phosphor-icons/react";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

import AdminLayout from "@/components/admin/AdminLayout";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import SongListRow from "@/components/admin/SongListRow";
import {
  adminApi,
  ApiError,
  isUnauthenticated,
  type ManagedSongResponse,
} from "@/lib/api/client";
import { withAdminPage } from "@/lib/auth/page";
import { Status } from "@/types";

/**
 * The song list: the entry point for everything else in the admin.
 *
 * Ordering is edited locally and saved explicitly. Saving on every arrow click
 * would send one full-list request per click, and each of those rewrites the
 * position of every row and invalidates the public cache.
 */

export default function AdminSongs({
  admin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [songs, setSongs] = useState<ManagedSongResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<ManagedSongResponse | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);

    try {
      setSongs(await adminApi.listSongs());
      setOrderDirty(false);
    } catch (error) {
      if (isUnauthenticated(error)) {
        window.location.href = "/admin/entrar?callbackUrl=%2Fadmin";
        return;
      }

      setLoadError(
        error instanceof ApiError
          ? error.message
          : "Não foi possível carregar as músicas.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function move(index: number, direction: -1 | 1) {
    setSongs((current) => {
      if (!current) return current;

      const target = index + direction;
      if (target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

    setOrderDirty(true);
  }

  async function saveOrder() {
    if (!songs) return;

    setBusy(true);

    try {
      // The complete list, always: the server rejects an order that has drifted
      // from the database, which is what stops a stale tab from silently
      // dropping a song it never saw to the end.
      await adminApi.reorderSongs(songs.map((song) => song.id));
      setOrderDirty(false);
      toast.success("Ordem salva.");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível salvar a ordem.",
      );

      // A 422 here means this tab is out of date; anything else leaves the
      // local order intact so the person can retry without redoing it.
      if (error instanceof ApiError && error.status === 422) await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(song: ManagedSongResponse) {
    const next =
      song.status === Status.active ? Status.inactive : Status.active;

    setSongs(
      (current) =>
        current?.map((item) =>
          item.id === song.id ? { ...item, status: next } : item,
        ) ?? current,
    );

    try {
      await adminApi.updateSong(song.id, { status: next });
    } catch (error) {
      setSongs(
        (current) =>
          current?.map((item) =>
            item.id === song.id ? { ...item, status: song.status } : item,
          ) ?? current,
      );

      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível alterar o status.",
      );
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    setBusy(true);

    try {
      const result = await adminApi.deleteSong(pendingDelete.id);

      setSongs(
        (current) =>
          current?.filter((item) => item.id !== pendingDelete.id) ?? current,
      );

      // Deletion of the audio is deferred by a week, so saying "removida" alone
      // would misdescribe what just happened to the bucket.
      toast.success(
        result.orphanedObjectKeys.length > 0
          ? `Música removida. ${result.orphanedObjectKeys.length} arquivo(s) serão apagados do armazenamento em 7 dias.`
          : "Música removida.",
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Não foi possível remover a música.",
      );
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  return (
    <AdminLayout
      admin={admin}
      title="Músicas"
      actions={
        <>
          {orderDirty && (
            <button
              type="button"
              onClick={saveOrder}
              disabled={busy}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Salvando..." : "Salvar ordem"}
            </button>
          )}
          <Link
            href="/admin/musicas/nova"
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus size={16} weight="bold" />
            Nova música
          </Link>
        </>
      }
    >
      {orderDirty && (
        <p className="rounded-xl bg-secondary/20 px-3 py-2 text-sm text-gray-200">
          A ordem foi alterada mas ainda não foi salva.
        </p>
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/15 px-3 py-2 text-sm text-gray-100">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 transition hover:bg-gray-600"
          >
            <ArrowClockwise size={14} />
            Recarregar
          </button>
        </div>
      )}

      {songs === null && !loadError && (
        <p className="text-sm text-gray-400">Carregando...</p>
      )}

      {songs?.length === 0 && (
        <p className="text-sm text-gray-400">
          Nenhuma música cadastrada ainda. Comece criando a primeira.
        </p>
      )}

      {songs && songs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {songs.map((song, index) => (
            <SongListRow
              key={song.id}
              song={song}
              isFirst={index === 0}
              isLast={index === songs.length - 1}
              busy={busy}
              onMove={(direction) => move(index, direction)}
              onToggleStatus={() => void toggleStatus(song)}
              onDelete={() => setPendingDelete(song)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remover música"
        description={
          <>
            <strong className="text-gray-100">{pendingDelete?.title}</strong> e
            seus {pendingDelete?.tracks.length ?? 0} kit(s) de voz serão
            removidos. Os arquivos de áudio saem do armazenamento após 7 dias.
            Esta ação não pode ser desfeita.
          </>
        }
        confirmLabel="Remover"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </AdminLayout>
  );
}

export const getServerSideProps = withAdminPage();
