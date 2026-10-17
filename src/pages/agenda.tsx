import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Event } from "@/types";
import { toast } from "react-toastify";

export default function Agenda() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        // Fails without a network only when nothing is cached
        const response = await fetch("/api/agenda").catch(() => {
          throw new Error("Sem conexão");
        });
        if (!response.ok) {
          throw new Error("Erro ao carregar a agenda");
        }
        const data = await response.json();
        setEvents(data.events);
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  return (
    <Layout title="Agenda | CJL">
      <div className="w-full p-5 flex flex-col items-center gap-4 rounded-3xl bg-gray-800 max-h-full">
        <h2 className="text-3xl font-bold text-gray-50">Agenda</h2>

        {loading && <p className="text-gray-50">Carregando...</p>}

        {!loading && (
          <div className="flex flex-col gap-4 w-full overflow-auto">
            {events.map((program) => {
              const eventDate = new Date(program.date + " 00:00:00");

              return (
                <div
                  key={program.id}
                  className="flex rounded-xl w-full bg-gray-700"
                >
                  <div className="flex flex-col p-2 text-4xl">
                    <p>{eventDate.getDate().toString().padStart(2, "0")}</p>
                    <hr className="border-t-2" />
                    <p>
                      {(eventDate.getMonth() + 1).toString().padStart(2, "0")}
                    </p>
                  </div>
                  <div className="flex flex-col p-2">
                    <h3 className="font-bold text-xl">{program.title}</h3>
                    <p className="text-xs text-gray-50">{program.location}</p>
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
