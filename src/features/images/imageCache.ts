import type { ImageResult } from "./image.types";

const settled = new Map<string, ImageResult>();
const inflight = new Map<string, Promise<ImageResult>>();

/** @internal */
export const clearImagePipelineCacheForTests = (): void => {
  settled.clear();
  inflight.clear();
};

export const peekResolvedImage = (key: string): ImageResult | undefined => settled.get(key);

/**
 * Single-flight cache: one in-flight resolve per key; completed results are reused.
 */
export const getOrResolveImage = (key: string, factory: () => Promise<ImageResult>): Promise<ImageResult> => {
  const done = settled.get(key);
  if (done) {
    return Promise.resolve(done);
  }
  const running = inflight.get(key);
  if (running) {
    return running;
  }
  const promise = factory()
    .then((result) => {
      settled.set(key, result);
      inflight.delete(key);
      return result;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, promise);
  return promise;
};
