import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { z } from "zod";
const facebookAppSecret = defineSecret("FACEBOOK_APP_SECRET");
const facebookAppId = defineString("FACEBOOK_APP_ID", { default: "" });
const readFacebookAppSecret = () => {
    try {
        return facebookAppSecret.value().trim();
    }
    catch {
        return typeof process.env.FACEBOOK_APP_SECRET === "string" ? process.env.FACEBOOK_APP_SECRET.trim() : "";
    }
};
const resolveBodySchema = z.object({
    url: z.string().min(1),
    entityId: z.string().min(1),
    entityType: z.enum(["trip", "activity", "place", "scenario", "saved_item"]),
});
const ALLOWED_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const getBearerToken = (authorizationHeader) => {
    if (!authorizationHeader?.startsWith("Bearer ")) {
        return null;
    }
    return authorizationHeader.slice("Bearer ".length);
};
const verifyFirebaseUser = async (authorizationHeader) => {
    const token = getBearerToken(authorizationHeader);
    if (!token) {
        return null;
    }
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
};
const normalizeInstagramInputUrl = (raw) => {
    const trimmed = raw.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProtocol;
};
const validateResolvableInstagramUrl = (url) => {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return { ok: false, reason: "invalid_url" };
    }
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) {
        return { ok: false, reason: "unsupported_host" };
    }
    const path = parsed.pathname.toLowerCase();
    if (path.includes("/stories/")) {
        return { ok: false, reason: "stories_not_supported" };
    }
    if (path.includes("/highlights/")) {
        return { ok: false, reason: "highlights_not_supported" };
    }
    if (!/\/(p|reel|reels|tv)\/[^/]+\/?/i.test(path)) {
        return { ok: false, reason: "unsupported_path" };
    }
    parsed.search = "";
    parsed.hash = "";
    return { ok: true, normalized: parsed.toString() };
};
const inferMediaType = (normalizedUrl, html) => {
    const lower = normalizedUrl.toLowerCase();
    if (lower.includes("/reel/") || lower.includes("/reels/") || lower.includes("/tv/")) {
        return "VIDEO";
    }
    const h = html?.toLowerCase() ?? "";
    if (h.includes("carousel") || h.includes("sidecar") || h.includes("graphsidecar")) {
        return "CAROUSEL_ALBUM";
    }
    return "IMAGE";
};
const fetchAppAccessToken = async () => {
    const appId = facebookAppId.value().trim();
    const secret = readFacebookAppSecret();
    if (!appId || !secret) {
        return null;
    }
    const endpoint = `https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`;
    const res = await fetch(endpoint);
    if (!res.ok) {
        return null;
    }
    const json = (await res.json());
    return typeof json.access_token === "string" ? json.access_token : null;
};
const fetchInstagramOEmbed = async (normalizedUrl, accessToken) => {
    const api = `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(normalizedUrl)}&access_token=${encodeURIComponent(accessToken)}&hidecaption=false`;
    const res = await fetch(api);
    const json = (await res.json());
    if (!res.ok) {
        const err = json.error;
        throw new Error(err?.message ?? "instagram_oembed_failed");
    }
    return json;
};
export const mediaGateway = onRequest({
    cors: true,
    region: "us-central1",
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [facebookAppSecret],
}, async (request, response) => {
    if (request.method === "OPTIONS") {
        response.status(204).send("");
        return;
    }
    if (request.method !== "POST") {
        response.status(405).json({ error: "Method not allowed" });
        return;
    }
    const path = request.path || new URL(request.url, "http://localhost").pathname;
    if (!path.includes("instagram/resolve")) {
        response.status(404).json({ error: "Not found" });
        return;
    }
    let userId = null;
    try {
        userId = await verifyFirebaseUser(request.header("authorization"));
    }
    catch {
        response.status(401).json({ error: "Invalid Firebase auth token" });
        return;
    }
    if (!userId) {
        response.status(401).json({ error: "Missing Firebase auth token" });
        return;
    }
    const parsedBody = resolveBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
        response.status(400).json({ error: "Invalid request body" });
        return;
    }
    const { url, entityId, entityType } = parsedBody.data;
    const normalizedInput = normalizeInstagramInputUrl(url);
    const validated = validateResolvableInstagramUrl(normalizedInput);
    if (!validated.ok) {
        response.status(200).json({
            attachment: {
                id: randomUUID(),
                entityId,
                entityType,
                source: "instagram",
                sourceUrl: normalizedInput,
                permalink: normalizedInput,
                fetchStatus: "failed",
                errorReason: validated.reason,
            },
        });
        return;
    }
    const normalized = validated.normalized;
    const db = getFirestore();
    const integrationSnap = await db.doc(`users/${userId}/integrations/instagram`).get();
    const userToken = typeof integrationSnap.data()?.accessToken === "string" ? (integrationSnap.data()?.accessToken).trim() : "";
    let token = userToken.length > 0 ? userToken : null;
    if (!token) {
        token = await fetchAppAccessToken();
    }
    if (!token) {
        response.status(200).json({
            attachment: {
                id: randomUUID(),
                entityId,
                entityType,
                source: "instagram",
                sourceUrl: normalized,
                permalink: normalized,
                fetchStatus: "failed",
                errorReason: "instagram_not_connected",
            },
        });
        return;
    }
    const tryResolveWithToken = async (accessToken) => fetchInstagramOEmbed(normalized, accessToken);
    try {
        let oembed;
        try {
            oembed = await tryResolveWithToken(token);
        }
        catch (firstError) {
            const appTok = await fetchAppAccessToken();
            if (!appTok || appTok === token) {
                throw firstError;
            }
            oembed = await tryResolveWithToken(appTok);
        }
        const thumbnailUrl = typeof oembed.thumbnail_url === "string" ? oembed.thumbnail_url : undefined;
        const title = typeof oembed.title === "string" ? oembed.title : undefined;
        const authorUrl = typeof oembed.author_url === "string" ? oembed.author_url : undefined;
        const html = typeof oembed.html === "string" ? oembed.html : undefined;
        const permalink = authorUrl ?? normalized;
        const caption = title;
        const mediaType = inferMediaType(normalized, html);
        const isCarouselHint = mediaType === "CAROUSEL_ALBUM" || (html?.toLowerCase().includes("carousel") ?? false);
        if (!thumbnailUrl && !permalink) {
            throw new Error("empty_oembed");
        }
        const fetchedAt = new Date().toISOString();
        response.status(200).json({
            attachment: {
                id: randomUUID(),
                entityId,
                entityType,
                source: "instagram",
                sourceUrl: normalized,
                permalink,
                mediaType,
                thumbnailUrl,
                mediaUrl: thumbnailUrl,
                caption,
                altText: title ? `${title} · Instagram media` : "Instagram media",
                fetchedAt,
                fetchStatus: "resolved",
                isCarouselHint: Boolean(isCarouselHint),
            },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "resolve_failed";
        response.status(200).json({
            attachment: {
                id: randomUUID(),
                entityId,
                entityType,
                source: "instagram",
                sourceUrl: normalized,
                permalink: normalized,
                fetchStatus: "failed",
                errorReason: message,
            },
        });
    }
});
