/**
 * Apple Music uses MusicKit + developer token + user music token.
 * TODO: Wire developer JWT + MusicKit authorization when `VITE_APPLE_MUSIC_DEVELOPER_TOKEN` flow exists.
 */
export const isAppleMusicIntegrationConfigured = (): boolean =>
  Boolean(import.meta.env.VITE_APPLE_MUSIC_DEVELOPER_TOKEN && import.meta.env.VITE_APPLE_MUSIC_TEAM_ID);
