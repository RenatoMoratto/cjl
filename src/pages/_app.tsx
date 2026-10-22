import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Analytics } from "@vercel/analytics/next";
import { useEffect } from "react";
import { SWRConfig } from "swr";
import { fetchJson } from "@/lib/fetcher";
import { listenForInstallPrompt } from "@/hooks/useInstallApp";
import SplashScreen from "@/components/SplashScreen";

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

  // The prompt may fire on any page, before the home page's install button
  useEffect(() => listenForInstallPrompt(), []);

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
      <SplashScreen />
      <Analytics />
    </SWRConfig>
  );
}
