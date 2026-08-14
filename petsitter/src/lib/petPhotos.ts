import { supabase } from './supabase';
import { generateId } from '../services';

/**
 * Pet photo storage backed by the public 'pet-photos' Supabase bucket.
 *
 * Historically the app stored the image picker's transient uri (a blob: URL
 * on web, a file: URI on native) verbatim in photo_url, so photos silently
 * vanished on reload or on any other device. These helpers upload the picked
 * image once and hand back a PERMANENT public URL, which is the only thing
 * that should ever be persisted.
 *
 * Object path contract (other agents rely on this exact shape):
 *   <auth.uid()>/<clientGeneratedId>.jpg
 */

const BUCKET = 'pet-photos';

/** Marker that identifies a public object URL for our bucket. */
const PUBLIC_PATH_MARKER = `/storage/v1/object/public/${BUCKET}/`;

/**
 * Content types the 'pet-photos' bucket accepts (mirrors the bucket's
 * allowed_mime_types in migration 0008). Anything else — including a missing
 * picker mimeType — falls back to image/jpeg.
 */
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Mirrors the bucket's file_size_limit (migration 0008). */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Upload a locally-picked photo and return its permanent public URL.
 *
 * `localUri` is whatever expo-image-picker handed us: a blob: URL on web or
 * a file: URI on native. `mimeType` is the picker asset's reported type
 * (`asset.mimeType`) — needed because the upload body is an ArrayBuffer,
 * which carries no type of its own.
 *
 * Throws (with a user-presentable message where we can) on auth, read, or
 * upload failure — callers surface the error and keep their previous value.
 */
export async function uploadPetPhoto(
  localUri: string,
  mimeType?: string
): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) {
    throw new Error('You must be signed in to upload a photo.');
  }

  // Read the picker's transient uri into an ArrayBuffer. Deliberately NOT
  // response.blob(): React Native's Blob is not a real web Blob, and passing
  // it to supabase-js storage is the known-broken pattern on native (0-byte
  // objects behind a valid-looking URL). ArrayBuffer works on web and native
  // alike and is Supabase's official Expo guidance.
  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  // The bucket enforces a 5 MB cap server-side; on web the picker returns the
  // ORIGINAL file (quality compression is native-only), so check here to give
  // a friendly error instead of the storage API's raw rejection.
  if (arrayBuffer.byteLength > MAX_PHOTO_BYTES) {
    throw new Error('That photo is too large (max 5 MB). Please pick a smaller one.');
  }

  const contentType =
    mimeType && ALLOWED_CONTENT_TYPES.has(mimeType) ? mimeType : 'image/jpeg';

  const path = `${userId}/${generateId()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload photo.');
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Best-effort removal of a previously uploaded pet photo.
 *
 * Accepts the stored photo_url. If it is a public URL for the 'pet-photos'
 * bucket, the object path is parsed out and removed from storage. Anything
 * else — legacy blob:/file: values that were stored verbatim before this fix,
 * or URLs from other origins — is silently ignored (no-op), since there is
 * nothing in storage to clean up.
 *
 * Storage errors are thrown so callers can decide; callers should treat
 * deletion as best-effort and ignore failures (a stranded object is harmless).
 * NOTE: the UI's Remove-photo path intentionally does NOT call this — the
 * object must outlive the unsaved removal (see PhotoPicker.removePhoto).
 * Kept for future hard-cleanup paths (e.g. permanent pet deletion).
 */
export async function deletePetPhoto(publicUrl: string): Promise<void> {
  const markerIndex = publicUrl.indexOf(PUBLIC_PATH_MARKER);
  if (markerIndex === -1) return; // not one of ours — nothing to delete

  // Strip any query string (e.g. transform params) and decode the path.
  const rawPath = publicUrl
    .slice(markerIndex + PUBLIC_PATH_MARKER.length)
    .split('?')[0];
  const path = decodeURIComponent(rawPath);
  if (!path) return;

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    throw new Error(error.message || 'Failed to delete photo.');
  }
}
