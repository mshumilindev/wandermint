import { useCallback, useEffect, useState } from "react";
import { usersRepository } from "../services/firebase/repositories/usersRepository";

export const useInstagramConnectionStatus = (userId: string | undefined): {
  connected: boolean;
  reconnectNeeded: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
} => {
  const [connected, setConnected] = useState(false);
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId?.trim()) {
      setConnected(false);
      setReconnectNeeded(false);
      return;
    }

    setLoading(true);
    try {
      const profile = await usersRepository.getUserProfile(userId);
      setConnected(Boolean(profile?.instagramSummary?.connected));
      setReconnectNeeded(Boolean(profile?.instagramSummary?.reconnectNeeded));
    } catch {
      setConnected(false);
      setReconnectNeeded(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { connected, reconnectNeeded, loading, refresh };
};
