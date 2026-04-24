import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger";
  isPending?: boolean;
  impactNote?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmActionDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  isPending = false,
  impactNote,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps): JSX.Element => (
  <Dialog open={open} onClose={isPending ? undefined : onCancel} fullWidth maxWidth="sm">
    <DialogTitle>{title}</DialogTitle>
    <DialogContent sx={{ display: "grid", gap: 1.5, pt: 1 }}>
      <Typography variant="body1" color="text.secondary">
        {description}
      </Typography>
      {impactNote ? <Alert severity={tone === "danger" ? "warning" : "info"}>{impactNote}</Alert> : null}
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel} disabled={isPending}>
        {cancelLabel}
      </Button>
      <Button color={tone === "danger" ? "error" : "primary"} variant="contained" disabled={isPending} onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
);
