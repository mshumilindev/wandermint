import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FoodCultureLayer } from "../../../entities/food-culture/model";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { FoodCultureBadge } from "./FoodCultureBadge";

export interface MustTryBeforeLeavingCardProps {
  layer: FoodCultureLayer | null;
}

export const MustTryBeforeLeavingCard = ({ layer }: MustTryBeforeLeavingCardProps): JSX.Element | null => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const lines = useMemo(() => {
    if (!layer) {
      return [];
    }
    const dish = layer.mustTryDishes.map((d) => d.label);
    const drink = layer.mustTryDrinks.map((d) => d.label);
    return [...dish, ...drink].slice(0, 8);
  }, [layer]);

  const preview = useMemo(() => lines.slice(0, 3), [lines]);

  if (!layer || preview.length === 0) {
    return null;
  }

  return (
    <GlassPanel sx={{ p: 2, display: "grid", gap: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
        {t("foodCulture.mustTryTitle")}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {preview.map((line) => (
          <FoodCultureBadge key={line} variant="must_try" label={line} />
        ))}
      </Box>
      {lines.length > 3 ? (
        <Accordion expanded={open} onChange={(_, v) => setOpen(v)} disableGutters elevation={0} sx={{ bgcolor: "transparent", "&:before": { display: "none" } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="caption" color="text.secondary">
              {t("foodCulture.expandMore")}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {lines.slice(3).map((line) => (
                <Typography key={line} variant="body2" color="text.secondary">
                  · {line}
                </Typography>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      ) : null}
    </GlassPanel>
  );
};
