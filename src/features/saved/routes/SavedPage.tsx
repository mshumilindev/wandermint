import { Box, Grid } from "@mui/material";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useLocalScenariosStore } from "../../../app/store/useLocalScenariosStore";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { ScenarioCardsGridSkeleton } from "../../../shared/ui/skeletons/ScenarioCardsGridSkeleton";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { ScenarioCard } from "../../local-scenarios/components/ScenarioCard";

export const SavedPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const ensureSavedScenarios = useLocalScenariosStore((state) => state.ensureSavedScenarios);
  const savedScenarioIds = useLocalScenariosStore((state) => state.savedScenarioIds);
  const scenariosById = useLocalScenariosStore((state) => state.scenariosById);
  const savedMeta = useLocalScenariosStore((state) => state.savedMeta);

  useEffect(() => {
    if (user) {
      void ensureSavedScenarios(user.id);
    }
  }, [ensureSavedScenarios, user]);

  const scenarios = savedScenarioIds
    .map((scenarioId) => scenariosById[scenarioId])
    .filter((scenario): scenario is NonNullable<typeof scenario> => Boolean(scenario));

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader title={t("dashboard.saved")} subtitle={t("saved.subtitle")} />
      {savedMeta.status === "loading" && scenarios.length === 0 ? (
        <ScenarioCardsGridSkeleton count={6} previewVariant="savedItem" showSaveAction={false} />
      ) : null}
      {scenarios.length === 0 && savedMeta.status !== "loading" ? (
        <EmptyState title={t("saved.emptyTitle")} description={t("saved.emptyDescription")} />
      ) : (
        <Grid container spacing={2}>
          {scenarios.map((scenario) => (
            <Grid item xs={12} sm={6} lg={4} key={scenario.id}>
              <ScenarioCard
                scenario={scenario}
                previewVariant="savedItem"
                saveLabel={t("local.save")}
                doneLabel={t("completion.done")}
                skippedLabel={t("completion.skipped")}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};
