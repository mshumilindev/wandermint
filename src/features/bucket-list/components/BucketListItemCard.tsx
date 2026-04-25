import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../../app/store/useUiStore";
import { EntityPreviewImage } from "../../../shared/ui/EntityPreviewImage";
import { MetadataPill } from "../../../shared/ui/MetadataPill";
import type { BucketListItem, BucketListPriority } from "../bucketList.types";
import { bucketListItemCityCountry, bucketListItemMapCoordinates } from "../bucketListNormalize";
import { writeBucketListTripPrefill } from "../bucketListTripPrefill";

export interface BucketListItemCardProps {
  item: BucketListItem;
  onMarkVisited: (item: BucketListItem, visited: boolean) => void;
  onEdit: (item: BucketListItem) => void;
  onRemove: (item: BucketListItem) => void;
  busy?: boolean;
}

const priorityTone = (p: BucketListPriority): "amber" | "teal" | "default" => {
  if (p === "high") {
    return "amber";
  }
  if (p === "medium") {
    return "teal";
  }
  return "default";
};

export const BucketListItemCard = ({ item, onMarkVisited, onEdit, onRemove, busy }: BucketListItemCardProps): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pushToast = useUiStore((state) => state.pushToast);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const locationLine = useMemo(() => {
    const cc = bucketListItemCityCountry(item);
    const city = cc.city?.trim();
    const country = cc.country?.trim();
    if (city && country) {
      return `${city}, ${country}`;
    }
    return city ?? country ?? t("bucketList.locationUnknown");
  }, [item, t]);

  const mapCoords = useMemo(() => bucketListItemMapCoordinates(item), [item]);

  const addToTrip = (): void => {
    setMenuAnchor(null);
    const mustSeeLine = [item.title, item.location?.city].filter(Boolean).join(" — ");
    writeBucketListTripPrefill({
      mustSeeLine,
      segmentCity: item.location?.city,
      segmentCountry: item.location?.country,
    });
    void navigate({ to: "/trips/new" });
    pushToast({ message: t("bucketList.addToTripOpened"), tone: "info" });
  };

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        opacity: busy ? 0.65 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "140px 1fr" }, gap: 0, alignItems: "stretch" }}>
        <Box sx={{ position: "relative", minHeight: { xs: 160, sm: "100%" } }}>
          <EntityPreviewImage
            variant="tripCard"
            entityId={`bucket:${item.id}`}
            title={item.title}
            locationHint={locationLine}
            categoryHint={item.category ?? item.payload.type}
            latitude={mapCoords?.lat}
            longitude={mapCoords?.lng}
            sx={{ height: "100%", minHeight: { xs: 160, sm: 140 }, borderRadius: 0 }}
          />
          {item.visited ? (
            <Chip
              icon={<CheckCircleOutlineRoundedIcon />}
              label={t("bucketList.visited")}
              size="small"
              color="success"
              sx={{ position: "absolute", top: 8, left: 8, fontWeight: 700 }}
            />
          ) : null}
        </Box>
        <CardContent sx={{ display: "grid", gap: 1.25, py: 2, pr: 5 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
            <MetadataPill label={t(`common.level.${item.priority}`)} tone={priorityTone(item.priority)} />
            <MetadataPill label={t(`bucketList.kind.${item.payload.type}`)} tone="default" />
            {item.category ? <MetadataPill label={item.category} tone="teal" /> : null}
            <Box sx={{ flex: 1 }} />
            <IconButton
              size="small"
              aria-label={t("bucketList.itemActions")}
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              disabled={busy}
            >
              <MoreVertRoundedIcon />
            </IconButton>
          </Box>
          <Typography variant="h6" sx={{ fontSize: "1.05rem", lineHeight: 1.3 }}>
            {item.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <FlagRoundedIcon sx={{ fontSize: 16, opacity: 0.7 }} />
            {locationLine}
          </Typography>
        </CardContent>
      </Box>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            addToTrip();
          }}
        >
          {t("bucketList.actionAddToTrip")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onMarkVisited(item, !item.visited);
          }}
        >
          {item.visited ? t("bucketList.actionMarkNotVisited") : t("bucketList.actionMarkVisited")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onEdit(item);
          }}
        >
          {t("common.edit")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            onRemove(item);
          }}
          sx={{ color: "error.main" }}
        >
          {t("common.delete")}
        </MenuItem>
      </Menu>
    </Card>
  );
};
