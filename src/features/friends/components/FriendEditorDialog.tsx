import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AddFriendInput, Friend, LocationSearchResult } from "../../../entities/friend/model";
import { getErrorMessage } from "../../../shared/lib/errors";
import { MiniMapPreview } from "./MiniMapPreview";
import { friendsLocationSearchService } from "../friendsLocationSearchService";

interface FriendEditorDialogProps {
  open: boolean;
  initialFriend: Friend | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: AddFriendInput) => Promise<void>;
}

export const FriendEditorDialog = ({ open, initialFriend, busy = false, onClose, onSubmit }: FriendEditorDialogProps): JSX.Element => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<LocationSearchResult | null>(null);
  const [locationOptions, setLocationOptions] = useState<LocationSearchResult[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(initialFriend?.name ?? "");
    setAvatarUrl(initialFriend?.avatarUrl ?? "");
    setNotes(initialFriend?.notes ?? "");
    if (initialFriend?.location) {
      const mapped: LocationSearchResult | null =
        initialFriend.location.coordinates
          ? {
              id: `existing:${initialFriend.id}`,
              label: initialFriend.location.label ?? [initialFriend.location.city, initialFriend.location.country].filter(Boolean).join(", "),
              city: initialFriend.location.city,
              country: initialFriend.location.country,
              address: initialFriend.location.address,
              coordinates: initialFriend.location.coordinates,
              provider: "existing",
            }
          : null;
      setSelectedLocation(mapped);
      setLocationQuery(initialFriend.location.label ?? [initialFriend.location.city, initialFriend.location.country].filter(Boolean).join(", "));
      setLocationOptions(mapped ? [mapped] : []);
    } else {
      setSelectedLocation(null);
      setLocationQuery("");
      setLocationOptions([]);
    }
    setError(null);
  }, [initialFriend, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const query = locationQuery.trim();
    if (query.length < 2) {
      setLocationOptions(selectedLocation ? [selectedLocation] : []);
      setLocationLoading(false);
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    const reqId = ++requestRef.current;
    timerRef.current = setTimeout(() => {
      setLocationLoading(true);
      void friendsLocationSearchService
        .searchLocations({ query, limit: 7 })
        .then((rows) => {
          if (requestRef.current !== reqId) {
            return;
          }
          setLocationOptions(rows);
        })
        .catch((nextError) => {
          if (requestRef.current !== reqId) {
            return;
          }
          setLocationOptions([]);
          setError(getErrorMessage(nextError));
        })
        .finally(() => {
          if (requestRef.current === reqId) {
            setLocationLoading(false);
          }
        });
    }, 360);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [locationQuery, open, selectedLocation]);

  const selectedLocationSummary = useMemo(() => {
    if (selectedLocation) {
      return selectedLocation.label;
    }
    return "";
  }, [selectedLocation]);

  const submit = async (): Promise<void> => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("friends.validation.nameRequired"));
      return;
    }
    const locationCity = selectedLocation?.city?.trim();
    if (!locationCity) {
      setError(t("friends.validation.locationRequired"));
      return;
    }
    const chosenLocation = selectedLocation;
    if (!chosenLocation) {
      setError(t("friends.validation.locationRequired"));
      return;
    }
    await onSubmit({
      name: trimmedName,
      location: {
        label: chosenLocation.label,
        city: chosenLocation.city.trim(),
        country: chosenLocation.country?.trim(),
        address: chosenLocation.address?.trim(),
        coordinates:
          chosenLocation.coordinates.lat !== 0 || chosenLocation.coordinates.lng !== 0
            ? chosenLocation.coordinates
            : undefined,
      },
      avatarUrl: avatarUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{initialFriend ? t("friends.editTitle") : t("friends.addTitle")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 1.5, pt: 1 }}>
        {error ? <Alert severity="warning">{error}</Alert> : null}
        <TextField
          label={t("friends.fields.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          fullWidth
          required
          disabled={busy}
        />
        <Box sx={{ display: "grid", gap: 0.7 }}>
          <TextField
            label={t("friends.fields.location")}
            value={locationQuery}
            onChange={(event) => {
              setLocationQuery(event.target.value);
              setSelectedLocation(null);
            }}
            placeholder={t("friends.locationSearchPlaceholder")}
            fullWidth
            required
            disabled={busy}
          />
          {locationLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                {t("friends.searching")}
              </Typography>
            </Box>
          ) : null}
          {locationOptions.length > 0 ? (
            <Box sx={{ display: "grid", gap: 0.5, maxHeight: 180, overflowY: "auto", pr: 0.3 }}>
              {locationOptions.map((row) => {
                const selected = selectedLocation?.id === row.id;
                return (
                  <Button
                    key={row.id}
                    variant={selected ? "contained" : "outlined"}
                    color={selected ? "primary" : "inherit"}
                    onClick={() => {
                      setSelectedLocation(row);
                      setLocationQuery(row.label);
                    }}
                    sx={{ justifyContent: "flex-start", textAlign: "left", textTransform: "none" }}
                    disabled={busy}
                  >
                    {row.label}
                  </Button>
                );
              })}
            </Box>
          ) : null}
          {selectedLocationSummary ? (
            <Typography variant="caption" color="text.secondary">
              {selectedLocationSummary}
            </Typography>
          ) : null}
        </Box>
        <MiniMapPreview
          coordinates={selectedLocation?.coordinates}
          label={selectedLocation?.label}
          city={selectedLocation?.city}
          country={selectedLocation?.country}
        />
        <TextField
          label={t("friends.fields.avatarUrl")}
          value={avatarUrl}
          onChange={(event) => setAvatarUrl(event.target.value)}
          fullWidth
          disabled={busy}
        />
        <TextField
          label={t("friends.fields.notes")}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          fullWidth
          multiline
          minRows={2}
          disabled={busy}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          {busy ? <CircularProgress size={18} color="inherit" /> : t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
