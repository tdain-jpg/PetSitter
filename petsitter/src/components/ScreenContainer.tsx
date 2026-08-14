import { View } from 'react-native';
import type { ReactNode } from 'react';

/**
 * ScreenContainer — responsive max-width wrapper for screen content.
 *
 * Caps content width on tablets/desktop while remaining a no-op on phones
 * (screens narrower than the cap). Renders a full-width, self-centered View,
 * so on native phones nothing changes visually.
 *
 * Variants:
 * - "form":    520px — single-column forms, auth screens
 * - "content": 760px — default; reading/detail screens, lists
 * - "wide":    1100px — dashboards, multi-column layouts
 *
 * Placement is the whole trick: the container wraps CONTENT — inside
 * ScrollViews (or around a header's inner content) — while full-bleed
 * backgrounds stay on the outer Views:
 *
 *   <View className="flex-1 bg-cream-200">          // full-bleed bg
 *     <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">  // full-bleed header bg
 *       <ScreenContainer variant="content">…header content…</ScreenContainer>
 *     </View>
 *     <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
 *       <ScreenContainer variant="content">…screen content…</ScreenContainer>
 *     </ScrollView>
 *   </View>
 */

const MAX_WIDTHS = {
  form: 520,
  content: 760,
  wide: 1100,
} as const;

interface ScreenContainerProps {
  children: ReactNode;
  variant?: 'form' | 'content' | 'wide';
  className?: string;
}

export function ScreenContainer({
  children,
  variant = 'content',
  className = '',
}: ScreenContainerProps) {
  return (
    <View
      className={`w-full self-center ${className}`}
      style={{ maxWidth: MAX_WIDTHS[variant] }}
    >
      {children}
    </View>
  );
}
