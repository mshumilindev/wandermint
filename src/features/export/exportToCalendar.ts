import type { DayPlan } from "../../entities/day-plan/model";
import type { ExportItineraryOptions, ExportItineraryResult } from "./export.types";
import { exportToICS } from "./exportToICS";

const triggerBrowserDownload = (ics: string, filename: string): void => {
  if (typeof document === "undefined") {
    return;
  }
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export type ExportToCalendarOptions = ExportItineraryOptions & {
  /** When true (default), triggers a file download in the browser after a successful export. */
  download?: boolean;
};

/**
 * Validates the itinerary timeline, builds an `.ics`, and optionally downloads it.
 * Infeasible days are blocked unless {@link ExportItineraryOptions.allowInfeasibleExportWithWarning} is set.
 */
export const exportToCalendar = (
  days: readonly DayPlan[],
  options: ExportToCalendarOptions,
): ExportItineraryResult => {
  const result = exportToICS(days, options);
  if (result.ok && (options.download === undefined || options.download)) {
    triggerBrowserDownload(result.ics, result.suggestedFilename);
  }
  return result;
};
