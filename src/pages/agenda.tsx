import useSWR from "swr";
import Layout from "@/components/Layout";
import LoadError from "@/components/LoadError";
import { Agenda as AgendaResponse } from "@/types";
import { FetchError } from "@/lib/fetcher";

export default function Agenda() {
  const {
    data,
    error,
    isLoading: loading,
    isValidating,
    mutate,
  } = useSWR<AgendaResponse, FetchError>("/api/agenda");
  const events = data?.events;

  return (
    <Layout title="Agenda | CJL">
      <div className="w-full p-5 flex flex-col items-center gap-4 rounded-3xl bg-gray-800 max-h-full">
        <h2 className="text-3xl font-bold text-gray-50">Agenda</h2>

        {/* A retry keeps the error up, with the button saying so */}
        {loading && !error && (
          // Cards of the list's own size, so it does not jump when it loads
          <div role="status" className="flex flex-col gap-4 w-full">
            <span className="sr-only">Carregando...</span>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 rounded-xl w-full bg-gray-700 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Offline, the agenda is answered from the cache, so this means it
            was never loaded on this device */}
        {error && !data && (
          <div className="py-4">
            <LoadError
              message={
                error.offline
                  ? "Sem conexão. A agenda aparece aqui quando você estiver online."
                  : "Não foi possível carregar a agenda."
              }
              onRetry={() => mutate()}
              retrying={isValidating}
            />
          </div>
        )}

        {events?.length === 0 && (
          <p className="text-gray-50">Nenhum evento agendado</p>
        )}

        {!loading && (
          <div className="flex flex-col gap-4 w-full overflow-auto">
            {events?.map((program) => {
              // "YYYY-MM-DD", already zero-padded; a Date would add a time zone
              const [, month, day] = program.date.split("-");

              return (
                <div
                  key={program.id}
                  className="flex rounded-xl w-full bg-gray-700"
                >
                  <div className="flex flex-col p-2 text-4xl">
                    <p>{day}</p>
                    <hr className="border-t-2" />
                    <p>{month}</p>
                  </div>
                  <div className="flex flex-col p-2">
                    <h3 className="font-bold text-xl">{program.title}</h3>
                    <p className="text-xs text-gray-50">
                      {program.time && `${program.time} · `}
                      {program.location}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
