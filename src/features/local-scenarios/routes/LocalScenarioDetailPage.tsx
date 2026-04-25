import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Box, Button, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useLocalScenariosStore } from "../../../app/store/useLocalScenariosStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { openAiGatewayClient } from "../../../services/ai/openAiGatewayClient";
import { movementPlanningService } from "../../../services/planning/movementPlanningService";
import { sanitizeOptionalUserFacingDescription } from "../../../shared/lib/userFacingText";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ScenarioCard } from "../components/ScenarioCard";

type ChatTurn = { role: "user" | "assistant"; content: string; patchSummary?: string };

export const LocalScenarioDetailPage = (): JSX.Element => {
  const { t } = useTranslation();
  const params = useParams({ strict: false }) as { scenarioId?: string };
  const scenarioId = params.scenarioId ?? "";
  const user = useAuthStore((state) => state.user);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const scenario = useLocalScenariosStore((state) => state.scenariosById[scenarioId]);
  const patchScenario = useLocalScenariosStore((state) => state.patchScenario);
  const saveScenario = useLocalScenariosStore((state) => state.saveScenario);

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setMessages([]);
  }, [scenarioId]);

  if (!scenario) {
    return <EmptyState title={t("local.detailMissing")} description={t("local.detailMissingHint")} />;
  }

  const quickActions = [
    t("local.chatQuickReplaceStop"),
    t("local.chatQuickSlower"),
    t("local.chatQuickOneStop"),
    t("local.chatQuickIndoor"),
  ];

  const submit = async (): Promise<void> => {
    if (!draft.trim()) {
      return;
    }

    const userMessage = draft.trim();
    setDraft("");
    setMessages((current) => [...current, { role: "user", content: userMessage }]);
    setSending(true);
    try {
      const response = await openAiGatewayClient.reviseLocalScenarioFromChat({
        scenario,
        userMessage,
        userPreferences: preferences,
        recentMessages: [...messages, { role: "user" as const, content: userMessage }].slice(-10),
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: sanitizeOptionalUserFacingDescription(response.assistantMessage) ?? response.assistantMessage,
        },
      ]);

      if (response.updatedScenario) {
        const legs = await movementPlanningService.buildMovementLegs(response.updatedScenario.blocks);
        patchScenario(scenarioId, { ...response.updatedScenario, movementLegs: legs });
      }
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: t("local.chatError") },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Button component={Link} to="/local" startIcon={<ArrowBackRoundedIcon />} variant="text" size="small">
          {t("local.backToGenerator")}
        </Button>
      </Box>
      <SectionHeader title={t("local.detailTitle")} subtitle={t("local.detailSubtitle")} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 400px" }, gap: 2, alignItems: "start" }}>
        <ScenarioCard
          scenario={scenario}
          saveLabel={t("local.save")}
          doneLabel={t("completion.done")}
          skippedLabel={t("completion.skipped")}
          onSave={user ? () => void saveScenario(user.id, scenarioId) : undefined}
        />
        <GlassPanel elevated sx={{ p: 2, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 1.5, minHeight: { lg: 520 }, position: { lg: "sticky" }, top: { lg: 96 } }}>
          <Typography variant="subtitle2" color="text.secondary">
            {t("local.chatTitle")}
          </Typography>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            {quickActions.map((label) => (
              <Chip key={label} size="small" label={label} onClick={() => setDraft(label)} disabled={sending} />
            ))}
          </Box>
          <Box sx={{ display: "grid", gap: 1, overflow: "auto", maxHeight: { xs: 280, lg: "unset" }, minHeight: 160 }}>
            {messages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("local.chatEmpty")}
              </Typography>
            ) : null}
            {messages.map((message, index) => (
              <Box
                key={`${message.role}-${index}`}
                sx={{ justifySelf: message.role === "user" ? "end" : "start", maxWidth: "92%" }}
              >
                <GlassPanel sx={{ p: 1.25, background: message.role === "user" ? "var(--wm-color-accent-amber-soft)" : "rgba(255,255,255,0.04)" }}>
                  <Typography variant="body2">{message.content}</Typography>
                </GlassPanel>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("local.chatPlaceholder")}
            />
            <Button variant="contained" onClick={() => void submit()} disabled={!draft.trim() || sending} sx={{ minWidth: 48, px: 1 }}>
              {sending ? <CircularProgress size={22} color="inherit" /> : <SendRoundedIcon />}
            </Button>
          </Box>
        </GlassPanel>
      </Box>
    </Box>
  );
};
