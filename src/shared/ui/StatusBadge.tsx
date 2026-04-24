import { MetadataPill } from "./MetadataPill";

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps): JSX.Element => {
  const tone = status.includes("need") || status.includes("review") ? "amber" : status.includes("done") || status.includes("complete") ? "teal" : "default";
  return <MetadataPill label={status.replaceAll("_", " ")} tone={tone} />;
};
