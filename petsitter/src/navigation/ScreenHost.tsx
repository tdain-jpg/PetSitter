import { useEffect, useRef, ComponentType } from 'react';
import { View, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/**
 * Takes screens that are not in front OUT of the keyboard tab order on web.
 *
 * A native-stack keeps previous screens MOUNTED underneath the current one —
 * that is how the back gesture stays instant. On native they are genuinely
 * off-screen, but on web they are just DOM, so every control on every screen
 * you have visited is still tabbable. QA counted five live "Go back" buttons at
 * once: a keyboard user tabbing through Settings would walk out of it and into
 * three invisible screens without any way to tell.
 *
 * `inert` is the fix, not `aria-hidden`. aria-hidden removes a subtree from the
 * accessibility tree but leaves it focusable, which produces the worse state of
 * the two — a focus ring sitting on a control a screen reader will not describe.
 * `inert` removes it from BOTH, which is exactly the intent: this screen is
 * still rendered, and it is not there.
 *
 * Applied through a ref rather than as a prop because React Native's View has
 * no `inert` in its types, and casting the props would hide that this is a
 * web-only concern. On native the effect returns immediately — the platform
 * already handles it.
 */
export function ScreenHost({ children }: { children: React.ReactNode }) {
  const isFocused = useIsFocused();
  const ref = useRef<View | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    if (isFocused) node.removeAttribute('inert');
    else node.setAttribute('inert', '');
  }, [isFocused]);

  return (
    <View ref={ref} style={{ flex: 1 }}>
      {children}
    </View>
  );
}

/**
 * Wrap a screen component once, at module scope.
 *
 * Must NOT be called during render: a new component identity on every render
 * would remount the screen and throw away its state on each parent update.
 */
export function hosted<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  const Hosted = (props: P) => (
    <ScreenHost>
      <Component {...props} />
    </ScreenHost>
  );
  Hosted.displayName = `Hosted(${Component.displayName || Component.name || 'Screen'})`;
  return Hosted;
}
