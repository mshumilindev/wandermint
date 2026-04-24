import { Alert, Box, Button } from "@mui/material";
import { useTranslation } from "react-i18next";

export const AppErrorBoundary = ({ reset }: { error: Error; reset: () => void }): JSX.Element => {
  const { t } = useTranslation();

  return (
    <Box sx={{ p: 4 }}>
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={reset}>
            {t("common.retry")}
          </Button>
        }
      >
        {t("states.error")}
      </Alert>
    </Box>
  );
};
