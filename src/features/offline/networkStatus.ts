import { useSyncExternalStore } from "react";

const getOnlineSnapshot = (): boolean => {
  if (typeof navigator === "undefined") {
    return true;
  }
  return navigator.onLine;
};

export const getIsOnline = (): boolean => getOnlineSnapshot();

/**
 * Subscribe to browser online/offline transitions.
 */
export const subscribeToNetworkStatus = (listener: (online: boolean) => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (): void => {
    listener(getOnlineSnapshot());
  };

  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
};

export const useNetworkStatus = (): boolean =>
  useSyncExternalStore(
    (onStoreChange) => subscribeToNetworkStatus(() => onStoreChange()),
    getOnlineSnapshot,
    () => true,
  );
