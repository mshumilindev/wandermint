import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import MusicOffRoundedIcon from "@mui/icons-material/MusicOffRounded";
import { IconButton, Tooltip } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ostUrl from "../../assets/ost.mp3";
import { useUserPreferencesStore } from "../../app/store/useUserPreferencesStore";
import { nowIso } from "../../services/firebase/timestampMapper";

interface AudioControlProps {
  userId: string;
}

export const AudioControl = ({ userId }: AudioControlProps): JSX.Element => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const ensurePreferences = useUserPreferencesStore((state) => state.ensurePreferences);
  const savePreferences = useUserPreferencesStore((state) => state.savePreferences);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    void ensurePreferences(userId);
  }, [ensurePreferences, userId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !preferences) {
      return;
    }

    audio.volume = 0.22;
    audio.muted = preferences.audioMuted;
    if (!preferences.audioMuted) {
      void audio.play().then(() => setIsBlocked(false)).catch(() => setIsBlocked(true));
    }
  }, [preferences]);

  const toggleAudio = async (): Promise<void> => {
    if (!preferences) {
      return;
    }

    const nextMuted = !preferences.audioMuted;
    await savePreferences({ ...preferences, audioMuted: nextMuted, updatedAt: nowIso() });
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.muted = nextMuted;
    if (!nextMuted) {
      await audio.play().then(() => setIsBlocked(false)).catch(() => setIsBlocked(true));
    }
  };

  const label = preferences?.audioMuted || isBlocked ? t("audio.unmute") : t("audio.mute");

  return (
    <>
      <audio ref={audioRef} src={ostUrl} loop preload="auto" />
      <Tooltip title={label}>
        <IconButton
          aria-label={label}
          onClick={() => void toggleAudio()}
          sx={{
            border: "1px solid var(--wm-glass-border)",
            background: "rgba(8, 14, 20, 0.42)",
            backdropFilter: "var(--wm-blur-panel)",
          }}
        >
          {preferences?.audioMuted || isBlocked ? <MusicOffRoundedIcon /> : <MusicNoteRoundedIcon />}
        </IconButton>
      </Tooltip>
    </>
  );
};
