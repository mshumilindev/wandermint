import type { ActivityBlock } from "../../../entities/activity/model";
import type { ActivityOverlayEntry } from "./planOverlayModel";

export const isEffectivelyVisited = (block: ActivityBlock, overlay?: ActivityOverlayEntry): boolean =>
  Boolean(overlay?.visited) || block.completionStatus === "done";

export const isEffectivelySkipped = (block: ActivityBlock, overlay?: ActivityOverlayEntry): boolean =>
  Boolean(overlay?.skipped) || block.completionStatus === "skipped";

export const hasRealLocation = (block: ActivityBlock): boolean =>
  Boolean(block.place?.latitude !== undefined && block.place?.longitude !== undefined && block.place?.name?.trim());
