import { ArrowLeft } from "@phosphor-icons/react";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "react-toastify";

import AdminLayout from "@/components/admin/AdminLayout";
import SongForm, { type SongFormValues } from "@/components/admin/SongForm";
import { adminApi } from "@/lib/api/client";
import { withAdminPage } from "@/lib/auth/page";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { Status } from "@/types";

const BLANK: SongFormValues = {
  slug: "",
  title: "",
  author: "",
  imageUrl: "",
  status: Status.active,
};

export default function NovaMusica({
  admin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { errors, fieldError, capture, clear } = useFieldErrors();
  const [busy, setBusy] = useState(false);

  async function create(values: SongFormValues) {
    setBusy(true);
    clear();

    try {
      const song = await adminApi.createSong(values);
      toast.success("Música criada. Agora envie os kits de voz.");
      // Straight to the edit screen, which is where the kits and the lyric are.
      await router.replace(`/admin/musicas/${song.id}`);
    } catch (error) {
      capture(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      admin={admin}
      title="Nova música"
      actions={
        <Link
          href="/admin"
          className="flex items-center gap-1.5 rounded-xl bg-gray-700 px-4 py-2 text-sm text-gray-100 transition hover:bg-gray-600"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>
      }
    >
      <SongForm
        initial={BLANK}
        submitLabel="Criar música"
        busy={busy}
        serverFieldError={fieldError}
        formErrors={errors.form}
        onSubmit={(values) => create(values)}
      />
    </AdminLayout>
  );
}

export const getServerSideProps = withAdminPage();
