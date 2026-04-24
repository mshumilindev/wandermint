import GoogleIcon from "@mui/icons-material/Google";
import { Alert, Box, Button, Container, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { BrandExperienceHero } from "../../../shared/ui/BrandExperienceHero";
import { GlassPanel } from "../../../shared/ui/GlassPanel";
import { useAuthStore } from "../../../app/store/useAuthStore";

export const AuthPage = (): JSX.Element => {
  const { t } = useTranslation();
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const error = useAuthStore((state) => state.error);

  return (
    <Box sx={{ minHeight: "100vh", px: { xs: 1.5, md: 3 }, py: { xs: 2, md: 3 }, display: "grid", alignContent: "start", gap: 2.5 }}>
      <Container maxWidth={false} sx={{ maxWidth: 1560 }}>
        <BrandExperienceHero variant="auth" />
        <Box sx={{ mt: 2.5, display: "grid", justifyItems: "center", gap: 2 }}>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 720, textAlign: "center" }}>
            {t("auth.body")}
          </Typography>
          <GlassPanel sx={{ p: 2, width: "100%", maxWidth: 430, background: "rgba(3, 15, 23, 0.72)" }}>
            <Box sx={{ display: "grid", gap: 1.5 }}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Button size="large" variant="contained" startIcon={<GoogleIcon />} onClick={() => void signInWithGoogle()}>
                {t("auth.google")}
              </Button>
            </Box>
          </GlassPanel>
        </Box>
      </Container>
    </Box>
  );
};
