import { useCallback, useEffect, useState } from "react";

export type WebPushPermission = "default" | "granted" | "denied" | "unsupported";

interface UseWebPush {
  permission: WebPushPermission;
  requestPermission: () => Promise<WebPushPermission>;
  fire: (input: { title: string; body: string; onClick?: () => void }) => void;
}

const isSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

const readPermission = (): WebPushPermission => {
  if (!isSupported()) return "unsupported";
  return Notification.permission as WebPushPermission;
};

/**
 * Hook for desktop Web Push notifications. Never auto-prompts:
 * `requestPermission` must be called from an explicit user gesture.
 *
 * `fire` returns silently when the tab is visible (the in-page pill is
 * already showing the same message) or when permission is not granted.
 */
export function useWebPush(): UseWebPush {
  const [permission, setPermission] = useState<WebPushPermission>("default");

  useEffect(() => {
    setPermission(readPermission());
  }, []);

  const requestPermission = useCallback(async (): Promise<WebPushPermission> => {
    if (!isSupported()) return "unsupported";
    const result = (await Notification.requestPermission()) as WebPushPermission;
    setPermission(result);
    return result;
  }, []);

  const fire = useCallback(
    ({
      title,
      body,
      onClick,
    }: {
      title: string;
      body: string;
      onClick?: () => void;
    }): void => {
      if (!isSupported()) return;
      if (Notification.permission !== "granted") return;
      // Only fire when the tab is hidden — pill already covers visible case.
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        return;
      }

      const n = new Notification(title, {
        body,
        tag: "cesare",
        icon: "/favicon.ico",
      });
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignored — some browsers restrict programmatic focus.
        }
        onClick?.();
        n.close();
      };
    },
    [],
  );

  return { permission, requestPermission, fire };
}
