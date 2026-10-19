import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Analytics } from "@vercel/analytics/next";
import { useEffect } from "react";
import { SWRConfig } from "swr";
import { fetchJson } from "@/lib/fetcher";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(`/sw.js?build=${window.__NEXT_DATA__.buildId}`)
      .catch((error) =>
        console.error("Service worker registration failed", error),
      );
  }, []);

  return (
    <SWRConfig
      value={{
        fetcher: fetchJson,
        // Data is reloaded when a page is opened again and when the connection
        // comes back. Not on focus, and no automatic retries: offline, both
        // would only repeat the same error toast.
        revalidateOnFocus: false,
        shouldRetryOnError: false,
      }}
    >
      <Component {...pageProps} />
      <Analytics />
    </SWRConfig>
  );
}
