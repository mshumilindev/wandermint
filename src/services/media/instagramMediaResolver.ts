import type { EntityMediaAttachment, MediaEntityType } from "../../entities/media/model";
import { entityMediaAttachmentSchema } from "../../entities/media/schemas";
import { postJsonWithAuth } from "./mediaApiClient";

const ALLOWED_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

export const normalizeInstagramUrl = (raw: string): string => {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol;
};

export const isInstagramUrlClientPlausible = (raw: string): boolean => {
  try {
    const u = new URL(normalizeInstagramUrl(raw));
    if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) {
      return false;
    }
    const path = u.pathname.toLowerCase();
    if (path.includes("/stories/") || path.includes("/highlights/")) {
      return false;
    }
    return /\/(p|reel|reels|tv)\/[^/]+/i.test(path);
  } catch {
    return false;
  }
};

export interface ResolveInstagramInput {
  url: string;
  entityId: string;
  entityType: MediaEntityType;
}

export const resolveInstagramMediaAttachment = async (input: ResolveInstagramInput): Promise<EntityMediaAttachment> => {
  const normalized = normalizeInstagramUrl(input.url);
  const json = await postJsonWithAuth<{ attachment?: unknown }>("/instagram/resolve", {
    url: normalized,
    entityId: input.entityId,
    entityType: input.entityType,
  });
  const parsed = entityMediaAttachmentSchema.safeParse(json.attachment);
  if (!parsed.success) {
    return {
      id: `ig_err_${Date.now().toString(36)}`,
      entityId: input.entityId,
      entityType: input.entityType,
      source: "instagram",
      sourceUrl: normalized,
      permalink: normalized,
      fetchStatus: "failed",
      errorReason: "invalid_server_payload",
    };
  }
  return parsed.data;
};
