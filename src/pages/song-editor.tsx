import { useState, ChangeEvent, FormEvent } from "react";
import CustomToastContainer from "@/components/CustomToastContainer";

type SongStatus = "active" | "inactive";

interface LyricLine {
  text: string;
  time: number;
  isSolo: boolean;
}

interface Song {
  id: number;
  status: SongStatus;
  title: string;
  author: string;
  musicPath: string;
  imageUrl: string;
  lyrics: {
    lines: LyricLine[];
  };
}

export default function SongEditor() {
  const [form, setForm] = useState<Omit<Song, "lyrics">>({
    id: 0,
    status: "active",
    title: "",
    author: "",
    musicPath: "",
    imageUrl: "",
  });

  const [lines, setLines] = useState<LyricLine[]>([
    { text: "", time: 0, isSolo: false },
  ]);

  const [submittedJson, setSubmittedJson] = useState<Song | null>(null);

  const handleFormChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === "id" ? Number(value) : value,
    }));
  };

  const handleLineChange = (
    index: number,
    field: keyof LyricLine,
    value: string | boolean,
  ) => {
    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              [field]:
                field === "time"
                  ? mmssToSeconds(value as string)
                  : (value as (typeof line)[typeof field]),
            }
          : line,
      ),
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, { text: "", time: 0, isSolo: false }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Convert total seconds to "mm:ss" string
  const secondsToMMSS = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Convert "mm:ss" string to total seconds
  const mmssToSeconds = (mmss: string) => {
    const [m, s] = mmss.split(":").map(Number);
    if (isNaN(m) || isNaN(s)) return 0;
    return m * 60 + s;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const json: Song = {
      ...form,
      lyrics: {
        lines: lines.map((line) => ({
          text: line.text,
          time: Number(line.time),
          isSolo: Boolean(line.isSolo),
        })),
      },
    };
    setSubmittedJson(json);
  };

  // Add this function near the top of your component
  const handleLoadJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data: Song = JSON.parse(event.target?.result as string);
        // Fill form fields
        const { lyrics, ...rest } = data;
        setForm(rest);
        setLines(
          lyrics.lines.length
            ? lyrics.lines
            : [{ text: "", time: 0, isSolo: false }],
        );
        setSubmittedJson(data);
      } catch (err) {
        console.error("Invalid JSON file", err);
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-dvh bg-[url(/images/coral.webp)] bg-no-repeat bg-cover bg-center">
      <div className="bg-black/60 h-full flex justify-center items-center">
        <div className="container w-full h-full">
          <div className="w-full h-full p-5 flex flex-col items-center gap-5">
            <CustomToastContainer />

            <main className="flex-1 w-full flex overflow-auto">
              <div className="w-full p-5 flex flex-col gap-6 rounded-3xl bg-gray-800 max-h-full overflow-hidden">
                <h2 className="text-3xl font-bold text-gray-50">Song Editor</h2>

                <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                  {/* Form Section */}
                  <form
                    onSubmit={handleSubmit}
                    className="space-y-6 flex-1 overflow-y-auto pr-2"
                  >
                    <div>
                      <div className="flex justify-end mb-3">
                        <label className="bg-[var(--color-secondary)] text-white px-4 py-2 rounded cursor-pointer text-sm hover:opacity-90">
                          Load JSON
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleLoadJson}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                    {/* Song main fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {["id", "title", "author", "musicPath", "imageUrl"].map(
                        (field) => (
                          <div key={field} className="relative">
                            <input
                              type={field === "id" ? "number" : "text"}
                              name={field}
                              value={
                                form[field as keyof typeof form] as
                                  | string
                                  | number
                              }
                              onChange={handleFormChange}
                              className="peer w-full bg-transparent placeholder-transparent text-gray-50 text-sm border border-gray-600 rounded-md px-3 py-2 transition duration-200 ease focus:outline-none focus:border-[var(--color-primary)] hover:border-gray-400 shadow-sm"
                            />
                            <label className="absolute cursor-text bg-gray-800 px-1 left-2.5 -top-2 text-xs text-gray-300 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-2.5 peer-placeholder-shown:left-3 peer-focus:-top-2 peer-focus:left-2.5 peer-focus:text-xs peer-focus:text-[var(--color-primary)] transition-all duration-200">
                              {field}
                            </label>
                          </div>
                        ),
                      )}
                      <select
                        name="status"
                        value={form.status}
                        onChange={handleFormChange}
                        className="border border-gray-600 p-2 rounded w-full text-sm text-gray-50 bg-gray-700 focus:outline-none focus:border-[var(--color-primary)]"
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </div>

                    {/* Lyrics lines */}
                    <div>
                      <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">
                        Lyrics Lines
                      </h2>
                      <div className="flex flex-col gap-3">
                        {lines.map((line, index) => (
                          <div
                            key={index}
                            className="flex flex-col md:flex-row items-center gap-2"
                          >
                            <input
                              type="text"
                              placeholder="Text"
                              value={line.text}
                              onChange={(e) =>
                                handleLineChange(index, "text", e.target.value)
                              }
                              className="border border-gray-600 bg-gray-700 text-gray-50 p-2 rounded flex-1 text-sm focus:border-[var(--color-primary)]"
                            />
                            <input
                              type="text"
                              placeholder="Time (mm:ss)"
                              value={secondsToMMSS(line.time)}
                              onChange={(e) =>
                                handleLineChange(index, "time", e.target.value)
                              }
                              className="border border-gray-600 bg-gray-700 text-gray-50 p-2 rounded w-28 text-sm focus:border-[var(--color-primary)]"
                            />

                            <label className="flex items-center gap-1 text-[var(--foreground)] text-sm">
                              <input
                                type="checkbox"
                                checked={line.isSolo}
                                onChange={(e) =>
                                  handleLineChange(
                                    index,
                                    "isSolo",
                                    e.target.checked,
                                  )
                                }
                              />
                              Solo
                            </label>
                            <button
                              type="button"
                              onClick={() => removeLine(index)}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={addLine}
                        className="mt-3 bg-[var(--color-secondary)] hover:opacity-90 text-white px-4 py-2 rounded text-sm"
                      >
                        + Add Line
                      </button>
                    </div>

                    {/* Submit */}
                    <button
                      type="submit"
                      className="bg-[var(--color-primary)] hover:opacity-90 text-white px-6 py-2 rounded font-medium"
                    >
                      Save Song
                    </button>
                  </form>

                  {/* JSON Preview */}
                  {submittedJson && (
                    <div className="bg-gray-900 p-4 rounded-lg shadow-lg text-sm text-gray-100 w-full lg:w-[40%] overflow-y-auto">
                      <h2 className="text-lg font-semibold mb-2 text-[var(--foreground)]">
                        Generated JSON
                      </h2>
                      <pre className="bg-gray-800 p-3 rounded overflow-x-auto">
                        {JSON.stringify(submittedJson, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
