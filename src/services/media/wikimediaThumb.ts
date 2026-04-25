export const wikimediaUrlSupportsWidthThumb = (url: string): boolean => /\/(\d+)px-[^/]+$/i.test(url);

/**
 * Wikimedia `upload.wikimedia.org/.../thumb/.../NNNpx-file` URLs are fragile:
 * requesting a different `NNN` than the one in `page/summary` `thumbnail.source` often returns **400**
 * (only some discrete widths exist per file, and upscaling always fails when the summary URL is already max).
 *
 * We therefore **never rewrite** the thumbnail URL; the browser scales down via CSS/`sizes` as needed.
 */
export const rescaleWikimediaThumbUrl = (url: string, _targetWidth: number): string => url;

export const buildWikimediaSrcSet = (_url: string, _widths: readonly number[]): string | undefined => undefined;
