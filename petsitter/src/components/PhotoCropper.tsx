import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Modal, PanResponder, Pressable } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Button } from './Button';
import { COLORS } from '../constants';
import { showAlert } from '../lib/showAlert';
import { friendlyError } from '../lib/errors';

/**
 * Square-crop a picked photo, with a circular preview, before it is uploaded.
 *
 * WEB ONLY, and that is the whole reason it exists. expo-image-picker's
 * `allowsEditing` gives a real native cropper on iOS and Android — which is why
 * Tim saw one on his phone — but does nothing on web. So a browser user's
 * landscape photo was centre-cropped by CSS at display time, and a dog standing
 * off to one side simply lost its head in the avatar.
 *
 * No gesture library and no slider: PanResponder is React Native core and zoom
 * is two buttons plus the mouse wheel, so this adds no dependency for a screen
 * most users see once per pet.
 *
 * THE COORDINATE MATH, since it is the part worth being careful about.
 * `baseScale` is what makes the SHORTER edge exactly fill the viewport at zoom
 * 1, so there is never a gap. The displayed image is therefore
 * natural * baseScale * zoom, and `offset` is the image's top-left relative to
 * the viewport's — always <= 0 and >= viewport - displayed, which is what keeps
 * the frame covered no matter where it is dragged. Converting back for the
 * crop is that same relationship inverted: a viewport pixel is
 * 1 / (baseScale * zoom) source pixels.
 */

const VIEWPORT = 260;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface PhotoCropperProps {
  /** Local uri of the picked image. */
  uri: string;
  onCancel: () => void;
  /** Called with the uri of the cropped square. */
  onCropped: (uri: string) => void;
}

export function PhotoCropper({ uri, onCancel, onCropped }: PhotoCropperProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);

  // Refs shadow the state so PanResponder — created once — always reads the
  // live values instead of the ones captured when it was built.
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const naturalRef = useRef(natural);
  naturalRef.current = natural;

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled) return;
        setNatural({ w, h });
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      },
      () => {
        if (cancelled) return;
        showAlert("Couldn't read that image", 'Try picking it again.');
        onCancel();
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uri, onCancel]);

  const baseScale = natural ? VIEWPORT / Math.min(natural.w, natural.h) : 1;

  /** Keep the image covering the viewport, whatever the drag or zoom did. */
  const clamp = (next: { x: number; y: number }, z: number, nat: { w: number; h: number }) => {
    const scale = (VIEWPORT / Math.min(nat.w, nat.h)) * z;
    const dispW = nat.w * scale;
    const dispH = nat.h * scale;
    return {
      x: Math.min(0, Math.max(VIEWPORT - dispW, next.x)),
      y: Math.min(0, Math.max(VIEWPORT - dispH, next.y)),
    };
  };

  // Centre on first measure and whenever zoom changes, so the subject the user
  // framed does not drift when they zoom.
  useEffect(() => {
    if (!natural) return;
    setOffset((prev) => clamp(prev, zoom, natural));
  }, [zoom, natural]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_e, g) => {
          const nat = naturalRef.current;
          if (!nat) return;
          // dx/dy are deltas from the gesture START, so apply them to the
          // offset as it was when the gesture began — tracked below.
          const start = gestureStart.current;
          setOffset(clamp({ x: start.x + g.dx, y: start.y + g.dy }, zoomRef.current, nat));
        },
        onPanResponderGrant: () => {
          gestureStart.current = { ...offsetRef.current };
        },
      }),
    []
  );
  const gestureStart = useRef({ x: 0, y: 0 });

  /**
   * Wheel-to-zoom, attached to the DOM node rather than passed as a prop.
   *
   * React Native's View has no onWheel in its types, and casting the props to
   * `any` to smuggle one in would hide the fact that this is a web-only
   * affordance. Attaching it here says so plainly, and the listener is
   * non-passive because it calls preventDefault to stop the page scrolling
   * under the cursor.
   */
  const viewportRef = useRef<View | null>(null);
  useEffect(() => {
    const node = viewportRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - Math.sign(e.deltaY) * 0.15)));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const applyZoom = (next: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));

  const handleConfirm = async () => {
    if (!natural || working) return;
    setWorking(true);
    try {
      const scale = baseScale * zoom;
      // A viewport pixel is 1 / scale source pixels. Round and clamp so a
      // sub-pixel drift can never ask the manipulator for a rectangle that
      // starts outside the image or runs off its edge — which throws.
      const size = Math.round(VIEWPORT / scale);
      const originX = Math.round(-offset.x / scale);
      const originY = Math.round(-offset.y / scale);
      const crop = {
        originX: Math.max(0, Math.min(originX, natural.w - 1)),
        originY: Math.max(0, Math.min(originY, natural.h - 1)),
        width: Math.max(1, Math.min(size, natural.w - originX)),
        height: Math.max(1, Math.min(size, natural.h - originY)),
      };
      const out = await ImageManipulator.manipulateAsync(uri, [{ crop }], {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.9,
      });
      onCropped(out.uri);
    } catch (err: any) {
      showAlert('Error', friendlyError(err, "Couldn't crop that photo. You can use it as it is."));
      // Fall back to the uncropped image rather than trapping the user in a
      // dialog they cannot complete — resizeForUpload still runs after this.
      onCropped(uri);
    } finally {
      setWorking(false);
    }
  };

  const dispW = natural ? natural.w * baseScale * zoom : 0;
  const dispH = natural ? natural.h * baseScale * zoom : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/60 p-4">
        <View className="bg-cream-50 rounded-2xl p-5 w-full" style={{ maxWidth: 360 }}>
          <Text className="text-xl font-bold text-brown-800 mb-1">Position the photo</Text>
          <Text className="text-tan-500 text-sm mb-4">
            Drag to move, and zoom until it looks right. The circle is what will show.
          </Text>

          <View
            className="self-center overflow-hidden bg-tan-100"
            style={{ width: VIEWPORT, height: VIEWPORT, borderRadius: VIEWPORT / 2 }}
            {...pan.panHandlers}
            ref={viewportRef}
          >
            {natural ? (
              <Image
                source={{ uri }}
                style={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width: dispW,
                  height: dispH,
                }}
                resizeMode="cover"
              />
            ) : null}
          </View>

          <View className="flex-row items-center justify-center mt-4" style={{ gap: 12 }}>
            <Pressable
              onPress={() => applyZoom(zoom - 0.25)}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              className="bg-tan-100 rounded-lg"
            >
              <Text className="text-xl text-brown-800">−</Text>
            </Pressable>
            <Text className="text-tan-500 text-sm" style={{ minWidth: 48, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </Text>
            <Pressable
              onPress={() => applyZoom(zoom + 0.25)}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              className="bg-tan-100 rounded-lg"
            >
              <Text className="text-xl text-brown-800">+</Text>
            </Pressable>
          </View>

          <View className="mt-5" style={{ gap: 10 }}>
            <Button
              title={working ? 'Cropping…' : 'Use this photo'}
              onPress={handleConfirm}
              loading={working}
              disabled={working || !natural}
            />
            <Button title="Cancel" onPress={onCancel} variant="outline" disabled={working} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
