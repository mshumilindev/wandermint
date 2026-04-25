import { firebaseAuth } from "../firebase/firebaseApp";

const defaultMediaBase = "/api/media";

export const mediaApiBaseUrl = (): string => {
  const fromEnv = import.meta.env.VITE_MEDIA_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return defaultMediaBase;
};

export const postJsonWithAuth = async <TResponse>(path: string, body: unknown): Promise<TResponse> => {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error("auth_required");
  }
  const idToken = await user.getIdToken();
  const base = mediaApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = json as { error?: string };
    throw new Error(err.error ?? `http_${response.status}`);
  }
  return json as TResponse;
};
