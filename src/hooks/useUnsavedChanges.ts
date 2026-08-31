import { useRouter } from "next/router";
import { useEffect } from "react";

/**
 * Warns before leaving a screen with unsaved work.
 *
 * Two separate mechanisms, because they cover different exits: `beforeunload`
 * catches closing the tab or reloading, and Next's router event catches a
 * client-side navigation, which never triggers `beforeunload`.
 */
export function useUnsavedChanges(dirty: boolean, message: string): void {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers show their own wording and ignore ours; assigning is still
      // what marks the event as needing a prompt.
      event.returnValue = message;
      return message;
    };

    const onRouteChange = () => {
      if (window.confirm(message)) return;

      // Cancelling a Pages Router navigation has no API: the documented way is
      // to emit the error event and throw. The throw is caught by the router
      // itself, and logs a line to the console — expected, not a bug here.
      router.events.emit("routeChangeError");
      throw "Route change aborted by unsaved changes guard";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    router.events.on("routeChangeStart", onRouteChange);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      router.events.off("routeChangeStart", onRouteChange);
    };
  }, [dirty, message, router.events]);
}
