import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import { Alert, Avatar, Box, Button, IconButton, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../app/store/useAuthStore";
import { useFriendsStore } from "../../../app/store/useFriendsStore";
import type { AddFriendInput, Friend } from "../../../entities/friend/model";
import { getErrorMessage } from "../../../shared/lib/errors";
import { ConfirmActionDialog } from "../../../shared/ui/ConfirmActionDialog";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { SectionHeader } from "../../../shared/ui/SectionHeader";
import { FriendEditorDialog } from "../components/FriendEditorDialog";

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const FriendsPage = (): JSX.Element => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const friendIds = useFriendsStore((state) => state.friendIds);
  const friendsById = useFriendsStore((state) => state.friendsById);
  const meta = useFriendsStore((state) => state.meta);
  const ensureFriends = useFriendsStore((state) => state.ensureFriends);
  const addFriend = useFriendsStore((state) => state.addFriend);
  const updateFriend = useFriendsStore((state) => state.updateFriend);
  const removeFriend = useFriendsStore((state) => state.deleteFriend);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Friend | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Friend | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      void ensureFriends(user.id);
    }
  }, [ensureFriends, user?.id]);

  const friends = useMemo(
    () => friendIds.map((id) => friendsById[id]).filter((f): f is Friend => Boolean(f)),
    [friendIds, friendsById],
  );

  const filteredFriends = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return friends;
    }
    return friends.filter((row) => {
      const cityCountry = [row.location.city, row.location.country].filter(Boolean).join(" ").toLowerCase();
      return row.name.toLowerCase().includes(normalized) || cityCountry.includes(normalized);
    });
  }, [friends, query]);

  const saveFriend = async (input: AddFriendInput): Promise<void> => {
    if (!user?.id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateFriend(user.id, editing.id, input);
      } else {
        await addFriend(user.id, input);
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  const deleteFriend = async (): Promise<void> => {
    if (!user?.id || !pendingDelete) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await removeFriend(user.id, pendingDelete.id);
      setPendingDelete(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2.5 }}>
      <SectionHeader
        title={t("friends.title")}
        subtitle={t("friends.subtitle")}
        action={
          <Button variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={() => setDialogOpen(true)}>
            {t("friends.addCta")}
          </Button>
        }
      />
      {meta.status === "error" && meta.error ? <Alert severity="error">{meta.error}</Alert> : null}
      {error ? <Alert severity="warning">{error}</Alert> : null}
      <GlassPanel sx={{ p: 2, display: "grid", gap: 1.25 }}>
        <TextField
          label={t("friends.searchLabel")}
          placeholder={t("friends.searchPlaceholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          fullWidth
        />
        {friends.length === 0 ? (
          <Box sx={{ border: "1px dashed rgba(183, 237, 226, 0.24)", borderRadius: 2, p: 2.5, textAlign: "center", display: "grid", gap: 0.8 }}>
            <Typography variant="subtitle1">{t("friends.emptyTitle")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("friends.emptyBody")}
            </Typography>
            <Box>
              <Button variant="outlined" startIcon={<PersonAddRoundedIcon />} onClick={() => setDialogOpen(true)}>
                {t("friends.addCta")}
              </Button>
            </Box>
          </Box>
        ) : filteredFriends.length === 0 ? (
          <Alert severity="info">{t("friends.noSearchResults")}</Alert>
        ) : (
          <Box sx={{ display: "grid", gap: 1 }}>
            {filteredFriends.map((friend) => (
              <Box
                key={friend.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 1.2,
                  p: 1.2,
                  borderRadius: 2,
                  border: "1px solid rgba(183, 237, 226, 0.16)",
                  background: "rgba(4, 14, 20, 0.42)",
                }}
              >
                <Avatar src={friend.avatarUrl} alt={friend.name} sx={{ width: 40, height: 40 }}>
                  {initials(friend.name)}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {friend.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[friend.location.city, friend.location.country].filter(Boolean).join(", ")}
                  </Typography>
                  {friend.location.address ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {friend.location.address}
                    </Typography>
                  ) : null}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                  <IconButton
                    aria-label={t("friends.editFriendAria", { name: friend.name })}
                    onClick={() => {
                      setEditing(friend);
                      setDialogOpen(true);
                    }}
                  >
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                  <IconButton aria-label={t("friends.deleteFriendAria", { name: friend.name })} onClick={() => setPendingDelete(friend)}>
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </GlassPanel>
      <FriendEditorDialog
        open={dialogOpen}
        initialFriend={editing}
        busy={busy}
        onClose={() => {
          if (!busy) {
            setDialogOpen(false);
            setEditing(null);
          }
        }}
        onSubmit={saveFriend}
      />
      <ConfirmActionDialog
        open={Boolean(pendingDelete)}
        title={t("friends.deleteConfirmTitle")}
        description={pendingDelete ? t("friends.deleteConfirmBody", { name: pendingDelete.name }) : t("friends.deleteConfirmBodyFallback")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        isPending={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void deleteFriend()}
      />
    </Box>
  );
};
