import { Box } from "@mui/material";

export const countryLabelToIsoCode = (country: string | undefined): string | undefined => {
  if (!country?.trim()) {
    return undefined;
  }
  const trimmed = country.trim();
  if (trimmed.length === 2 && /^[a-z]{2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return countryToIso[trimmed.toLowerCase()];
};

const countryToIso: Record<string, string> = {
  poland: "PL",
  japan: "JP",
  "czech republic": "CZ",
  czechia: "CZ",
  "united kingdom": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  ireland: "IE",
  portugal: "PT",
  france: "FR",
  germany: "DE",
  italy: "IT",
  spain: "ES",
  netherlands: "NL",
  belgium: "BE",
  austria: "AT",
  switzerland: "CH",
  croatia: "HR",
  greece: "GR",
  hungary: "HU",
  slovakia: "SK",
  romania: "RO",
  bulgaria: "BG",
  norway: "NO",
  sweden: "SE",
  finland: "FI",
  denmark: "DK",
  iceland: "IS",
  "united states": "US",
  canada: "CA",
  mexico: "MX",
};

const isoToFlagEmoji = (isoCode: string): string =>
  isoCode
    .toUpperCase()
    .replace(/./g, (character) => String.fromCodePoint(127397 + character.charCodeAt(0)));

export const getCountryFlagEmoji = (country: string | undefined): string | null => {
  if (!country?.trim()) {
    return null;
  }

  const isoCode = countryToIso[country.trim().toLowerCase()];
  return isoCode ? isoToFlagEmoji(isoCode) : null;
};

export const CountryFlag = ({
  country,
  countryCode,
  size = "1rem",
}: {
  country?: string;
  countryCode?: string;
  size?: string | number;
}): JSX.Element | null => {
  const iso = countryCode?.trim().length === 2 ? countryCode.trim().toUpperCase() : countryLabelToIsoCode(country);
  const flag = iso ? isoToFlagEmoji(iso) : getCountryFlagEmoji(country);
  if (!flag) {
    return null;
  }

  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.25em",
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {flag}
    </Box>
  );
};
