import { useSyncExternalStore } from "react";

/**
 * Installing the site as an app.
 *
 * Chromium browsers (Chrome, Edge, Samsung Internet, Opera) fire
 * beforeinstallprompt, whose prompt() opens their own install dialog. The
 * event is kept from the start, in _app.tsx, since it may fire on any page.
 * Other browsers install only from their own menus, so the user gets steps
 * for it instead. Browsers that cannot install at all get nothing.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Which steps to show when the browser has no install prompt. */
export type InstallPlatform =
  | "ios"
  | "chromium"
  | "safari-mac"
  | "firefox-android";

/**
 * "hidden": already running as the app, the browser cannot install it, or
 * still on the server. A platform: the steps to install from its menus.
 */
export type InstallStatus = "hidden" | "prompt" | InstallPlatform;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const standaloneQuery = () => window.matchMedia("(display-mode: standalone)");

// iOS sets navigator.standalone instead of matching the display mode
const isStandalone = () =>
  standaloneQuery().matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** Keeps the install prompt for later. Returns the cleanup. */
export function listenForInstallPrompt() {
  const handlePrompt = (event: Event) => {
    // No mini-infobar: installing is offered on the home page
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  };
  const handleInstalled = () => {
    deferredPrompt = null;
    installed = true;
    notify();
  };

  window.addEventListener("beforeinstallprompt", handlePrompt);
  window.addEventListener("appinstalled", handleInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", handlePrompt);
    window.removeEventListener("appinstalled", handleInstalled);
  };
}

function subscribe(listener: () => void) {
  const query = standaloneQuery();
  listeners.add(listener);
  query.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", listener);
  };
}

function getStatus(): InstallStatus {
  if (installed || isStandalone()) return "hidden";
  return deferredPrompt ? "prompt" : (installPlatform() ?? "hidden");
}

/**
 * Opens the browser's install dialog. A prompt can only be shown once, so the
 * next attempt falls back to the manual steps.
 */
async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return "unavailable";

  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return "unavailable";
  }
}

/**
 * Feature checks first. Only browsers that offer neither the prompt nor the
 * iOS share sheet are told apart by name, to pick the right menu. Null when
 * this browser cannot install the site.
 */
function installPlatform(): InstallPlatform | null {
  // Every iOS and iPadOS browser is WebKit and adds to the home screen from
  // its share menu
  if ("standalone" in navigator) return "ios";
  // A Chromium browser without a pending prompt: already dismissed, or the
  // app is already installed
  if ("onbeforeinstallprompt" in window) return "chromium";

  const userAgent = navigator.userAgent;
  if (/Firefox/.test(userAgent)) {
    return /Android/.test(userAgent) ? "firefox-android" : null;
  }
  if (/Macintosh/.test(userAgent) && /Safari/.test(userAgent)) {
    return "safari-mac";
  }
  return null;
}

export function useInstallApp() {
  const status = useSyncExternalStore(
    subscribe,
    getStatus,
    (): InstallStatus => "hidden",
  );
  return { status, promptInstall };
}
