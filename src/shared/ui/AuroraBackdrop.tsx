import { Box } from "@mui/material";
import nightSkyBackground from "../../assets/wandermint-night-sky-background.png";

export const AuroraBackdrop = (): JSX.Element => {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        backgroundColor: "#02030A",
      }}
    >
      <Box
        component="img"
        src={nightSkyBackground}
        alt=""
        sx={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          opacity: 0.9,
          filter: "saturate(0.82) brightness(0.52) contrast(1.04)",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 18% 14%, rgba(102, 255, 224, 0.08), transparent 24%), radial-gradient(circle at 78% 12%, rgba(255, 122, 156, 0.06), transparent 22%), linear-gradient(180deg, rgba(2, 3, 10, 0.42) 0%, rgba(4, 8, 18, 0.56) 40%, rgba(3, 9, 18, 0.72) 100%)",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 50%, transparent 0%, rgba(2, 4, 10, 0.14) 58%, rgba(2, 3, 10, 0.42) 100%)",
        }}
      />
    </Box>
  );
};
