import CategoryRoundedIcon from "@mui/icons-material/CategoryRounded";
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import FormatListNumberedRoundedIcon from "@mui/icons-material/FormatListNumberedRounded";
import LocationCityRoundedIcon from "@mui/icons-material/LocationCityRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import PlaylistAddCheckRoundedIcon from "@mui/icons-material/PlaylistAddCheckRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import type { SvgIconComponent } from "@mui/icons-material";

const ICONS: Record<string, SvgIconComponent> = {
  flag: FlagRoundedIcon,
  format_list_numbered: FormatListNumberedRoundedIcon,
  military_tech: MilitaryTechRoundedIcon,
  location_city: LocationCityRoundedIcon,
  map: MapRoundedIcon,
  public: PublicRoundedIcon,
  travel_explore: TravelExploreRoundedIcon,
  checklist: ChecklistRoundedIcon,
  playlist_add_check: PlaylistAddCheckRoundedIcon,
  trending_up: TrendingUpRoundedIcon,
  repeat: RepeatRoundedIcon,
  category: CategoryRoundedIcon,
  restaurant: RestaurantRoundedIcon,
  schedule: ScheduleRoundedIcon,
};

export const AchievementCatalogIcon = ({ name }: { name?: string }): JSX.Element => {
  const Icon = (name && ICONS[name]) || EmojiEventsRoundedIcon;
  return <Icon sx={{ fontSize: 28, color: "primary.main", opacity: 0.92 }} aria-hidden />;
};
