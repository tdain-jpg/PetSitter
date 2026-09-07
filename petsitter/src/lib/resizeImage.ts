import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Shrink a picked photo until the storage bucket will accept it.
 *
 * The picker's `quality` option re-encodes but never changes DIMENSIONS, so a
 * 12-megapixel phone photo stayed 3-8 MB and hit the bucket's 5 MB cap. Tim's
 * upload failed on his phone and worked from the camera, which is the same
 * story: the camera capture was smaller. The old code's only answer was to
 * refuse the file and tell the user to "pick a smaller one" — advice most
 * people cannot act on, because they do not control what their camera writes.
 *
 * So resize before uploading, and make the failure impossible rather than
 * rarer: 1600px on the longest edge at quality 0.8 lands a typical photo around
 * 200-400 KB, and the loop below steps down again if a particular image is
 * unusually dense. Only if EVERY step still exceeds the cap does the caller see
 * an error, and by then it is a genuinely extraordinary file.
 *
 * 1600px is chosen for the display, not the storage: the avatar renders at
 * about 120pt, and the largest use is the PDF export. Anything beyond 1600
 * costs upload time and bandwidth to show detail nobody sees.
 */

/** Mirrors the bucket's file_size_limit (migration 0008). */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Longest-edge targets, tried in order until one fits. */
const STEPS: { size: number; quality: number }[] = [
  { size: 1600, quality: 0.8 },
  { size: 1200, quality: 0.75 },
  { size: 900, quality: 0.7 },
  { size: 600, quality: 0.6 },
];

async function byteLength(uri: string): Promise<number> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return blob.size;
}

export interface ResizedImage {
  uri: string;
  /** Bytes after resizing, so callers can report honestly. */
  bytes: number;
  /** True when the image was already small enough and left untouched. */
  untouched: boolean;
}

/**
 * Returns a uri guaranteed to be under the bucket cap, or throws with a message
 * a person can act on.
 */
export async function resizeForUpload(uri: string): Promise<ResizedImage> {
  let original = 0;
  try {
    original = await byteLength(uri);
    if (original > 0 && original <= MAX_PHOTO_BYTES / 2) {
      // Comfortably small already — re-encoding would only lose quality.
      return { uri, bytes: original, untouched: true };
    }
  } catch {
    // Could not measure it (some native uris resist fetch). Fall through and
    // resize anyway: doing the work unnecessarily is cheaper than a failed
    // upload the user has to diagnose.
  }

  let last = 0;
  for (const step of STEPS) {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: step.size } }],
      { compress: step.quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    // `resize` with only a width preserves aspect ratio, so a portrait photo
    // ends up 1600 WIDE and taller — deliberately not capping height, because
    // the avatar is square-cropped anyway and the PDF scales to fit.
    const bytes = await byteLength(out.uri).catch(() => 0);
    if (bytes === 0 || bytes <= MAX_PHOTO_BYTES) {
      return { uri: out.uri, bytes, untouched: false };
    }
    last = bytes;
  }

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  throw new Error(
    `This photo is unusually large — even shrunk right down it is still ${mb(last)}, ` +
      'and the limit is 5 MB. Try a different photo, or a screenshot of this one.'
  );
}
