import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import { Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ReplanProposal } from "../../../entities/replan/model";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import { sanitizeOptionalUserFacingDescription } from "../../../shared/lib/userFacingText";

interface ReplanProposalCardProps {
  proposal: ReplanProposal;
  onApply?: (proposalId: string) => void;
  onDismiss?: (proposalId: string) => void;
}

export const ReplanProposalCard = ({ proposal, onApply, onDismiss }: ReplanProposalCardProps): JSX.Element => {
  const { t } = useTranslation();
  const cleanSummary = sanitizeOptionalUserFacingDescription(proposal.summary) ?? proposal.summary;

  return (
    <GlassPanel sx={{ p: 2, display: "grid", gap: 1.5 }}>
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      <MetadataPill icon={<AutoFixHighRoundedIcon />} label={proposal.reason.replaceAll("_", " ")} tone="teal" />
      <MetadataPill label={t("trips.actionCount", { count: proposal.actions.length })} />
    </Box>
    <Typography variant="subtitle1">{cleanSummary}</Typography>
    <Box sx={{ display: "grid", gap: 0.75 }}>
      {proposal.actions.map((action) => {
        const cleanRationale = sanitizeOptionalUserFacingDescription(action.rationale);
        return cleanRationale ? (
          <Typography key={action.id} variant="body2" color="text.secondary">
            {action.type.replaceAll("_", " ")}: {cleanRationale}
          </Typography>
        ) : null;
      })}
    </Box>
    {onApply || onDismiss ? (
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {onApply ? <Button variant="contained" onClick={() => onApply(proposal.id)}>{t("replan.apply")}</Button> : null}
        {onDismiss ? <Button variant="outlined" onClick={() => onDismiss(proposal.id)}>{t("replan.keep")}</Button> : null}
      </Box>
    ) : null}
    </GlassPanel>
  );
};
