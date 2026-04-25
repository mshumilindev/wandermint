import AddRoundedIcon from "@mui/icons-material/AddRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useUiStore } from "../../../app/store/useUiStore";
import { getErrorMessage } from "../../../shared/lib/errors";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { BucketListItemCard } from "../components/BucketListItemCard";
import { bucketListService } from "../bucketListService";
import { useBucketListQuickAddStore } from "../bucketListQuickAddStore";
import type { BucketListItem, BucketListPayload, BucketListPriority } from "../bucketList.types";
import { bucketListItemCityCountry } from "../bucketListNormalize";

type GroupMode = "flat" | "city" | "country" | "category";
type VisitedFilter = "all" | "visited" | "unvisited";

const groupKeyLabel = (key: string, t: (k: string) => string): string => {
  if (key === "__none__") {
    return t("bucketList.groupUnassigned");
  }
  return key;
};

const groupItems = (list: BucketListItem[], mode: GroupMode): Array<[string, BucketListItem[]]> => {
  if (mode === "flat") {
    return [["__all__", list]];
  }
  const map = new Map<string, BucketListItem[]>();
  for (const it of list) {
    let key: string;
    if (mode === "city") {
      key = it.location?.city?.trim() || "__none__";
    } else if (mode === "country") {
      key = it.location?.country?.trim() || "__none__";
    } else {
      key = it.category?.trim() || "__none__";
    }
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
};

export const BucketListPage = (): JSX.Element => {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id ?? "");
  const pushToast = useUiStore((s) => s.pushToast);
  const openQuickAdd = useBucketListQuickAddStore((s) => s.openDialog);
  const listGeneration = useBucketListQuickAddStore((s) => s.listGeneration);

  const [items, setItems] = useState<BucketListItem[]>([]);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error">("idle");

  const [groupMode, setGroupMode] = useState<GroupMode>("flat");
  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | BucketListPriority>("all");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [editing, setEditing] = useState<BucketListItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPriority, setEditPriority] = useState<BucketListPriority>("medium");
  const [editVisited, setEditVisited] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BucketListItem | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setItems([]);
      return;
    }
    setLoadStatus("loading");
    try {
      const rows = await bucketListService.list(userId);
      setItems(rows);
      setLoadStatus("idle");
    } catch (e) {
      setLoadStatus("error");
      pushToast({ message: `${t("bucketList.loadFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    }
  }, [userId, pushToast, t]);

  useEffect(() => {
    void refresh();
  }, [refresh, listGeneration]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.category?.trim()) {
        set.add(it.category.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (visitedFilter === "visited" && !it.visited) {
        return false;
      }
      if (visitedFilter === "unvisited" && it.visited) {
        return false;
      }
      if (categoryFilter !== "all" && (it.category ?? "") !== categoryFilter) {
        return false;
      }
      if (priorityFilter !== "all" && it.priority !== priorityFilter) {
        return false;
      }
      return true;
    });
  }, [items, visitedFilter, categoryFilter, priorityFilter]);

  const grouped = useMemo(() => groupItems(filtered, groupMode), [filtered, groupMode]);

  const openEdit = (item: BucketListItem): void => {
    setEditing(item);
    setEditTitle(item.payload.type === "experience" ? item.payload.label : item.title);
    const cc = bucketListItemCityCountry(item);
    setEditCity(cc.city ?? "");
    setEditCountry(cc.country ?? "");
    setEditCategory(item.category ?? "");
    setEditPriority(item.priority);
    setEditVisited(item.visited);
  };

  const saveEdit = async (): Promise<void> => {
    if (!userId || !editing) {
      return;
    }
    setBusyId(editing.id);
    try {
      let nextPayload: BucketListPayload | undefined;
      if (editing.payload.type === "experience") {
        const label = editTitle.trim();
        if (!label) {
          pushToast({ message: t("bucketList.experienceNeedLabel"), tone: "warning" });
          setBusyId(null);
          return;
        }
        nextPayload = { type: "experience", label };
      } else if (editing.payload.type === "destination") {
        const city = editCity.trim();
        const country = editCountry.trim();
        if (!city || !country) {
          pushToast({ message: t("bucketList.destinationNeedCityCountry"), tone: "warning" });
          setBusyId(null);
          return;
        }
        nextPayload = {
          type: "destination",
          location: {
            city,
            country,
            coordinates: editing.payload.location.coordinates,
          },
        };
      } else if (editing.payload.type === "place") {
        nextPayload = {
          type: "place",
          place: {
            ...editing.payload.place,
            name: editTitle.trim() || editing.payload.place.name,
            city: editCity.trim() || editing.payload.place.city,
            country: editCountry.trim() || editing.payload.place.country,
          },
        };
      } else if (editing.payload.type === "event") {
        nextPayload = {
          type: "event",
          event: {
            ...editing.payload.event,
            title: editTitle.trim() || editing.payload.event.title,
            city: editCity.trim() || editing.payload.event.city,
            country: editCountry.trim() || editing.payload.event.country,
          },
        };
      }

      let next = await bucketListService.patchItem(userId, editing.id, {
        ...(nextPayload ? { payload: nextPayload } : {}),
        category: editCategory.trim() || undefined,
        priority: editPriority,
      });
      if (next && editVisited !== next.visited) {
        next = (await bucketListService.setVisited(userId, editing.id, editVisited)) ?? next;
      }
      if (next) {
        setItems((prev) => prev.map((row) => (row.id === next!.id ? next! : row)));
        pushToast({ message: t("bucketList.savedEdits"), tone: "success" });
      }
      setEditing(null);
    } catch (e) {
      pushToast({ message: `${t("bucketList.saveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const markVisited = async (item: BucketListItem, visited: boolean): Promise<void> => {
    if (!userId) {
      return;
    }
    setBusyId(item.id);
    try {
      const next = await bucketListService.setVisited(userId, item.id, visited);
      if (next) {
        setItems((prev) => prev.map((row) => (row.id === next.id ? next : row)));
      }
    } catch (e) {
      pushToast({ message: `${t("bucketList.saveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async (): Promise<void> => {
    if (!userId || !removeTarget) {
      return;
    }
    setRemovePending(true);
    try {
      await bucketListService.remove(userId, removeTarget.id);
      setItems((prev) => prev.filter((row) => row.id !== removeTarget.id));
      pushToast({ message: t("bucketList.removedToast"), tone: "info" });
      setRemoveTarget(null);
    } catch (e) {
      pushToast({ message: `${t("bucketList.saveFailed")}: ${getErrorMessage(e)}`, tone: "error" });
    } finally {
      setRemovePending(false);
    }
  };

  const showFilterEmpty = items.length > 0 && filtered.length === 0;

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <SectionHeader
        title={t("bucketList.title")}
        subtitle={t("bucketList.subtitle")}
        action={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openQuickAdd}>
            {t("bucketList.add")}
          </Button>
        }
      />

      <GlassPanel sx={{ p: 2.5, display: "grid", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FilterListRoundedIcon color="action" fontSize="small" />
          <Typography variant="subtitle2">{t("bucketList.filtersHeading")}</Typography>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={visitedFilter}
            onChange={(_, v) => v && setVisitedFilter(v)}
            aria-label={t("bucketList.filterVisited")}
          >
            <ToggleButton value="all">{t("bucketList.filterVisitedAll")}</ToggleButton>
            <ToggleButton value="unvisited">{t("bucketList.filterUnvisited")}</ToggleButton>
            <ToggleButton value="visited">{t("bucketList.filterVisitedOnly")}</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="bl-cat-filter">{t("bucketList.filterCategory")}</InputLabel>
            <Select
              labelId="bl-cat-filter"
              label={t("bucketList.filterCategory")}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(String(e.target.value))}
            >
              <MenuItem value="all">{t("bucketList.filterCategoryAll")}</MenuItem>
              {categoryOptions.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="bl-pri-filter">{t("bucketList.filterPriority")}</InputLabel>
            <Select
              labelId="bl-pri-filter"
              label={t("bucketList.filterPriority")}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
            >
              <MenuItem value="all">{t("bucketList.filterPriorityAll")}</MenuItem>
              <MenuItem value="high">{t("common.level.high")}</MenuItem>
              <MenuItem value="medium">{t("common.level.medium")}</MenuItem>
              <MenuItem value="low">{t("common.level.low")}</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
            {t("bucketList.groupBy")}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={groupMode}
            onChange={(_, v) => v && setGroupMode(v)}
            aria-label={t("bucketList.groupBy")}
          >
            <ToggleButton value="flat">{t("bucketList.groupFlat")}</ToggleButton>
            <ToggleButton value="city">{t("bucketList.groupCity")}</ToggleButton>
            <ToggleButton value="country">{t("bucketList.groupCountry")}</ToggleButton>
            <ToggleButton value="category">{t("bucketList.groupCategory")}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </GlassPanel>

      {loadStatus === "error" ? (
        <GlassPanel sx={{ p: 3, display: "grid", gap: 2, textAlign: "center" }}>
          <Typography variant="body1" color="text.secondary">
            {t("bucketList.loadErrorGuidance")}
          </Typography>
          <Box>
            <Button variant="contained" onClick={() => void refresh()}>
              {t("common.retry")}
            </Button>
          </Box>
        </GlassPanel>
      ) : null}

      {loadStatus === "loading" && items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("common.loading")}
        </Typography>
      ) : null}

      {items.length === 0 && loadStatus !== "loading" && loadStatus !== "error" ? (
        <GlassPanel elevated sx={{ p: 3, display: "grid", gap: 2 }}>
          <Typography variant="h6">{t("bucketList.emptyTitle")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("bucketList.emptyBody")}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openQuickAdd}>
              {t("bucketList.emptyCtaAdd")}
            </Button>
            <Button variant="outlined" onClick={openQuickAdd}>
              {t("bucketList.emptyCtaIdeas")}
            </Button>
          </Box>
        </GlassPanel>
      ) : null}

      {showFilterEmpty ? (
        <GlassPanel sx={{ p: 2.5 }}>
          <Typography variant="body1" color="text.secondary">
            {t("bucketList.filterEmptyGuidance")}
          </Typography>
          <Button sx={{ mt: 1 }} size="small" onClick={() => {
            setVisitedFilter("all");
            setCategoryFilter("all");
            setPriorityFilter("all");
          }}>
            {t("bucketList.clearFilters")}
          </Button>
        </GlassPanel>
      ) : null}

      {!showFilterEmpty && filtered.length > 0
        ? grouped.map(([gKey, rows]) => (
            <Box key={gKey} sx={{ display: "grid", gap: 1.5 }}>
              {groupMode !== "flat" ? (
                <Typography variant="overline" color="primary.main" sx={{ letterSpacing: 1.5 }}>
                  {groupKeyLabel(gKey, t)} · {rows.length}
                </Typography>
              ) : null}
              <Box sx={{ display: "grid", gap: 2 }}>
                {rows.map((item) => (
                  <BucketListItemCard
                    key={item.id}
                    item={item}
                    onMarkVisited={(it, v) => void markVisited(it, v)}
                    onEdit={openEdit}
                    onRemove={(it) => setRemoveTarget(it)}
                    busy={busyId === item.id}
                  />
                ))}
              </Box>
            </Box>
          ))
        : null}

      <Dialog open={Boolean(editing)} onClose={() => !busyId && setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle>{t("bucketList.editTitle")}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t("bucketList.editHint")}
          </Typography>
          <TextField
            label={editing?.payload.type === "experience" ? t("bucketList.experienceLabel") : t("bucketList.fieldTitle")}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            fullWidth
            size="small"
          />
          {editing?.payload.type === "experience" ? null : (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              <TextField label={t("bucketList.fieldCity")} value={editCity} onChange={(e) => setEditCity(e.target.value)} fullWidth size="small" />
              <TextField label={t("bucketList.fieldCountry")} value={editCountry} onChange={(e) => setEditCountry(e.target.value)} fullWidth size="small" />
            </Box>
          )}
          <TextField label={t("bucketList.fieldCategory")} value={editCategory} onChange={(e) => setEditCategory(e.target.value)} fullWidth size="small" />
          <FormControl size="small" fullWidth>
            <InputLabel id="bl-edit-pri">{t("bucketList.fieldPriority")}</InputLabel>
            <Select labelId="bl-edit-pri" label={t("bucketList.fieldPriority")} value={editPriority} onChange={(e) => setEditPriority(e.target.value as BucketListPriority)}>
              <MenuItem value="high">{t("common.level.high")}</MenuItem>
              <MenuItem value="medium">{t("common.level.medium")}</MenuItem>
              <MenuItem value="low">{t("common.level.low")}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel id="bl-edit-vis">{t("bucketList.fieldVisited")}</InputLabel>
            <Select labelId="bl-edit-vis" label={t("bucketList.fieldVisited")} value={editVisited ? "yes" : "no"} onChange={(e) => setEditVisited(e.target.value === "yes")}>
              <MenuItem value="no">{t("bucketList.notVisited")}</MenuItem>
              <MenuItem value="yes">{t("bucketList.visited")}</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)} disabled={Boolean(busyId)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={() => void saveEdit()}
            disabled={
              Boolean(busyId) ||
              (editing?.payload.type === "experience" && !editTitle.trim()) ||
              (editing?.payload.type === "destination" && (!editCity.trim() || !editCountry.trim())) ||
              ((editing?.payload.type === "place" || editing?.payload.type === "event") && !editTitle.trim())
            }
          >
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(removeTarget)}
        title={t("bucketList.removeTitle")}
        description={removeTarget ? t("bucketList.removeBody", { title: removeTarget.title }) : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        isPending={removePending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
      />
    </Box>
  );
};
