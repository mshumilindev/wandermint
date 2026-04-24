import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Box, Button, Chip, TextField, Typography } from "@mui/material";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useTripChatStore } from "../../../app/store/useTripChatStore";
import { useTripDetailsStore } from "../../../app/store/useTripDetailsStore";
import { useTripsStore } from "../../../app/store/useTripsStore";
import { useUserPreferencesStore } from "../../../app/store/useUserPreferencesStore";
import { formatBudgetAmountLabel } from "../../../shared/lib/priceDisplay";
import { sanitizeOptionalUserFacingDescription } from "../../../shared/lib/userFacingText";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { WarningCard } from "../../trips/components/WarningCard";
import { ReplanProposalCard } from "../../trips/components/ReplanProposalCard";

export const TripChatPage = (): JSX.Element => {
  const { t } = useTranslation();
  const params = useParams({ strict: false }) as { tripId?: string };
  const tripId = params.tripId ?? "";
  const user = useAuthStore((state) => state.user);
  const preferences = useUserPreferencesStore((state) => state.preferences);
  const trip = useTripsStore((state) => state.tripsById[tripId]);
  const warnings = useTripDetailsStore((state) => state.warningsByTripId[tripId] ?? []);
  const proposals = useTripDetailsStore((state) => state.replanProposalsByTripId[tripId] ?? []);
  const ensureTripDetails = useTripDetailsStore((state) => state.ensureTripDetails);
  const applyReplanProposal = useTripDetailsStore((state) => state.applyReplanProposal);
  const dismissReplanProposal = useTripDetailsStore((state) => state.dismissReplanProposal);
  const ensureRecentMessages = useTripChatStore((state) => state.ensureRecentMessages);
  const sendMessage = useTripChatStore((state) => state.sendMessage);
  const threadId = useTripChatStore((state) => state.threadIdByTripId[tripId] ?? `thread_${tripId}`);
  const messages = useTripChatStore((state) => state.messagesByThreadId[threadId] ?? []);
  const [draft, setDraft] = useState("");
  const canSend = Boolean(user) && draft.trim().length > 0;
  const budgetLabel = trip
    ? formatBudgetAmountLabel(trip.budget.amount, trip.budget.currency, {
        preferredCurrency: preferences?.currency,
        locale: preferences?.locale,
      })
    : null;

  useEffect(() => {
    if (user && tripId) {
      void ensureTripDetails(user.id, tripId);
      void ensureRecentMessages(user.id, tripId);
    }
  }, [ensureRecentMessages, ensureTripDetails, tripId, user]);

  const quickActions = [
    t("chat.quickCheaper"),
    t("chat.quickWalking"),
    t("chat.quickFood"),
    t("chat.quickMuseums"),
    t("chat.quickNightlife"),
    t("chat.quickHidden"),
    t("chat.quickOutdoor"),
    t("chat.quickCompress"),
  ];

  const submit = async (): Promise<void> => {
    if (!user || draft.trim().length === 0) {
      return;
    }

    await sendMessage(user.id, tripId, draft.trim());
    setDraft("");
  };

  if (!trip) {
    return <EmptyState title={t("chat.title")} description={t("states.partialData")} />;
  }

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("chat.title")} subtitle={t("chat.subtitle")} />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "320px 1fr" }, gap: 2 }}>
        <Box sx={{ display: "grid", gap: 2, alignContent: "start" }}>
          <GlassPanel sx={{ p: 2.5, display: "grid", gap: 1 }}>
            <Typography variant="h6">{trip.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {trip.destination} | {budgetLabel} | {trip.preferences.pace}
            </Typography>
          </GlassPanel>
          {warnings.slice(0, 3).map((warning) => (
            <WarningCard key={warning.id} warning={warning} />
          ))}
          {proposals.slice(0, 3).map((proposal) => (
            <ReplanProposalCard
              key={proposal.id}
              proposal={proposal}
              onApply={(proposalId) => void applyReplanProposal(tripId, proposalId)}
              onDismiss={(proposalId) => void dismissReplanProposal(tripId, proposalId)}
            />
          ))}
        </Box>
        <GlassPanel elevated sx={{ p: { xs: 2, md: 3 }, minHeight: 620, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {quickActions.map((action) => (
              <Chip key={action} label={action} onClick={() => setDraft(action)} />
            ))}
          </Box>
          <Box sx={{ display: "grid", alignContent: "start", gap: 1.5, overflow: "auto" }}>
            {messages.length === 0 ? <Typography color="text.secondary">{t("chat.empty")}</Typography> : null}
            {messages.map((message) => {
              const cleanContent =
                message.role === "assistant" ? sanitizeOptionalUserFacingDescription(message.content) ?? message.content : message.content;
              const cleanPatchSummary = sanitizeOptionalUserFacingDescription(message.structuredPatchSummary);

              return (
                <Box key={message.id} sx={{ justifySelf: message.role === "user" ? "end" : "start", maxWidth: "78%" }}>
                  <GlassPanel sx={{ p: 1.5, background: message.role === "user" ? "var(--wm-color-accent-amber-soft)" : "rgba(255,255,255,0.04)" }}>
                    <Typography variant="body2">{cleanContent}</Typography>
                    {cleanPatchSummary ? (
                      <Typography variant="caption" color="text.secondary">
                        {cleanPatchSummary}
                      </Typography>
                    ) : null}
                  </GlassPanel>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField fullWidth placeholder={t("chat.placeholder")} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && canSend && void submit()} />
            <Button variant="contained" disabled={!canSend} endIcon={<SendRoundedIcon />} onClick={() => void submit()}>
              {t("chat.send")}
            </Button>
          </Box>
        </GlassPanel>
      </Box>
    </Box>
  );
};
