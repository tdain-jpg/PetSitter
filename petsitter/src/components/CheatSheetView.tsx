import { useState } from 'react';
import { View, Text, Image, type LayoutChangeEvent } from 'react-native';
import { Button } from './Button';
import { Card } from './Card';
import { SecurityNote } from './SecurityNote';
import { fillCheatSheetTokens } from '../lib/cheatSheetTokens';
import { COLORS } from '../constants';
import type { HomeInfo } from '../types';

const wordmark = require('../../assets/wordmark.png');

/**
 * The branded cheat-sheet card: Pawstructions wordmark + Crown header,
 * the AI security note, and the rendered sheet body. Token placeholders
 * ([[DOOR_CODE]] etc.) are filled from `homeInfo` at render time — see
 * src/lib/cheatSheetTokens.ts for the contract.
 *
 * Used by AICheatSheetScreen (real generated sheets) and
 * SampleCheatSheetScreen (a static pre-filled sample with no tokens).
 */
interface CheatSheetViewProps {
  content: string;
  homeInfo?: HomeInfo | null;
  /**
   * When set, a "Generated <date>" line appears under the header.
   * Real sheets pass cheat_sheet.generated_at; the sample omits it.
   */
  generatedAt?: string;
  /**
   * Free-tier treatment: a tiled diagonal PREVIEW wash behind the sheet body
   * plus a footer unlock line. Sheets are STORED unwatermarked — this is a
   * render-time decision keyed off Crown entitlement, so buying Crown clears
   * the wash instantly with no regeneration and no second AI charge.
   */
  watermarked?: boolean;
  /**
   * Makes the watermark footer a real CTA. Optional so this component stays
   * navigation-free: each screen supplies its own route to UnlockCrown.
   */
  onUnlockPress?: () => void;
  /**
   * Whether the READER is the owner. Separate from onUnlockPress on purpose:
   * that prop answers "render a button here", and the caller legitimately
   * withholds it from an owner when an identical button already renders
   * directly below. Using its absence to mean "not the owner" would have shown
   * the owner the sitter's copy in exactly that case.
   */
  isOwner?: boolean;
}

// ---------------------------------------------------------------------------
// PREVIEW wash
//
// The word is PREVIEW, never "sample": this sheet carries real medication
// doses, and a sitter must never be left wondering whether the CONTENT is
// made up. "Preview" describes what the user has unlocked; "sample" would
// impugn the data.
//
// Geometry and colour are chosen so the wash is unmistakable at a glance —
// nobody would hand this version to a sitter — while every word stays
// readable: gold at low opacity behind cream leaves body text (brown-600 on
// cream-50) near 6:1 contrast, and the layer is absolute + first-in-tree, so
// it can never paint over a dose.
// ---------------------------------------------------------------------------
const WATERMARK_WORD_ROW = 'PREVIEW    PREVIEW    PREVIEW    PREVIEW';
const WATERMARK_ROW_HEIGHT = 128;
const WATERMARK_OPACITY = 0.18;
/** Rows painted before onLayout reports the card's real height. */
const WATERMARK_INITIAL_ROWS = 5;
/** One row above and one below, so rotation can't leave the corners bare. */
const WATERMARK_BLEED_ROWS = 2;

function PreviewWash() {
  const [rows, setRows] = useState(WATERMARK_INITIAL_ROWS);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    const needed = Math.ceil(height / WATERMARK_ROW_HEIGHT) + WATERMARK_BLEED_ROWS;
    // Only ever grow within a render pass: setState in onLayout re-lays-out,
    // and a shrink-then-grow pair would oscillate.
    setRows((current) => (needed > current ? needed : current));
  };

  return (
    <View
      // "PREVIEW" read aloud once per tile would bury the sheet a screen-reader
      // user actually came for. The footer line below says it once, in words.
      // All three props are needed: accessibilityElementsHidden is iOS-only,
      // importantForAccessibility Android-only, and react-native-web emits the
      // DOM aria-hidden only for `aria-hidden` (verified in the browser — the
      // two native props alone left the tiles exposed on web).
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={handleLayout}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // Matches Card's rounded-xl so the wash can't square off the corners.
        borderRadius: 12,
        overflow: 'hidden',
        opacity: WATERMARK_OPACITY,
        // Never intercepts touches — the sheet body and the unlock CTA sit
        // above it and must stay tappable and selectable. As a style, not the
        // `pointerEvents` prop: react-native-web warns that the prop is
        // deprecated (seen in the console).
        pointerEvents: 'none',
      }}
    >
      {/* Pulled up by one row so the first diagonal starts above the card. */}
      <View style={{ marginTop: -WATERMARK_ROW_HEIGHT }}>
        {Array.from({ length: rows }, (_, row) => (
          <View
            key={row}
            style={{
              height: WATERMARK_ROW_HEIGHT,
              justifyContent: 'center',
              // Wider than the card, nudged left, so the rotated band still
              // reaches both edges instead of tapering off at the corners.
              width: '150%',
              marginLeft: row % 2 === 0 ? '-25%' : '-15%',
              transform: [{ rotate: '-24deg' }],
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: COLORS.warmDark,
                fontSize: 34,
                fontWeight: '800',
                letterSpacing: 10,
              }}
            >
              {WATERMARK_WORD_ROW}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Markdown renderer for cheat sheets: real bold, section rules, callouts,
// and defensive handling of any table/hrule the model shouldn't emit.
// Inline renderer: real bold instead of stripped ** markers.
const renderInline = (
  text: string,
  baseClass: string,
  key: number | string
) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <Text key={key} className={baseClass}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} className="font-bold text-brown-800">
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
};

const renderMarkdown = (content: string) => {
  const lines = content.split('\n');
  return lines.map((line, index) => {
    const t = line.trim();

    // Horizontal rules → a real divider, never literal dashes.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      return <View key={index} className="border-t border-tan-200 my-3" />;
    }
    // Markdown-table separator rows (|---|---|) → drop entirely.
    if (/^\|[\s\-:|]+\|$/.test(t)) {
      return null;
    }
    // Table rows → label/value lines. The prompt forbids tables, but raw
    // pipes must never reach a reader if the model emits one anyway.
    if (t.startsWith('|')) {
      const cells = t
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length === 0) return null;
      const asText =
        cells.length >= 2
          ? `**${cells[0].replace(/\*\*/g, '')}:** ${cells.slice(1).join(' · ')}`
          : cells[0];
      return renderInline(asText, 'text-brown-600 mb-1', index);
    }

    // Headers
    if (line.startsWith('### ')) {
      return renderInline(
        line.slice(4),
        'text-base font-semibold text-brown-800 mt-4 mb-2',
        index
      );
    }
    if (line.startsWith('## ')) {
      return (
        <View
          key={index}
          className="mt-5 mb-2 pb-1 border-b border-tan-200"
        >
          {renderInline(
            line.slice(3),
            'text-lg font-bold text-primary-600',
            `h${index}`
          )}
        </View>
      );
    }
    if (line.startsWith('# ')) {
      return renderInline(
        line.slice(2),
        'text-xl font-bold text-primary-600 mt-4 mb-3',
        index
      );
    }

    // Blockquotes → warning callout
    if (t.startsWith('>')) {
      return (
        <View
          key={index}
          className="bg-cream-100 border-l-4 border-accent-500 rounded px-3 py-2 my-2"
        >
          {renderInline(
            t.replace(/^>\s*/, ''),
            'text-brown-800 text-sm',
            `q${index}`
          )}
        </View>
      );
    }

    // Bullets and numbered lists
    if (t.startsWith('- ') || t.startsWith('* ')) {
      return renderInline(
        `•  ${t.replace(/^[-*] /, '')}`,
        'text-brown-600 ml-3 mb-1',
        index
      );
    }
    if (/^\d+\.\s/.test(t)) {
      return renderInline(t, 'text-brown-600 ml-3 mb-1', index);
    }

    // Empty lines
    if (t === '') {
      return <View key={index} className="h-2" />;
    }

    // Regular text
    return renderInline(line, 'text-brown-600 mb-1', index);
  });
};

export function CheatSheetView({
  content,
  homeInfo,
  generatedAt,
  watermarked = false,
  onUnlockPress,
  isOwner = true,
}: CheatSheetViewProps) {
  return (
    <Card className="mb-4">
      {/* First in the tree AND absolutely positioned, so every sibling below
          paints on top of it. Order is what puts the wash behind the words. */}
      {watermarked && <PreviewWash />}

      {/* Branded sheet header */}
      <View className="items-center mb-3">
        <Image
          source={wordmark}
          style={{ width: 150, height: 31 }}
          resizeMode="contain"
          accessibilityLabel="Pawstructions"
        />
        <Text className="text-tan-400 text-xs mt-2" style={{ letterSpacing: 2 }}>
          👑 CROWN AI CHEAT SHEET
        </Text>
        {generatedAt && (
          <Text className="text-tan-400 text-xs mt-1">
            Generated {new Date(generatedAt).toLocaleString()}
          </Text>
        )}
      </View>
      <SecurityNote context="ai" />

      <View className="border-t border-tan-200 pt-4">
        {renderMarkdown(fillCheatSheetTokens(content, homeInfo))}
      </View>

      {watermarked && (
        <View className="border-t border-tan-200 mt-4 pt-3">
          <Text
            className="text-warm-700 font-bold text-xs mb-1"
            style={{ letterSpacing: 2 }}
          >
            PREVIEW
          </Text>
          {/* Says plainly that the CONTENT is real. A sitter reading a dose off
              a watermarked page must not hesitate, and the owner deciding
              whether to pay deserves to know exactly what the $5 changes —
              which is BOTH halves: the watermark and the regeneration paywall.
              Naming only the watermark would sell Crown as cosmetic and leave
              the user to discover the 402 after they change a dose. */}
          {/* Two audiences now read this. 0023 let a connected sitter see the
              sheet, and the sentence still called it "your own sheet, written
              from your guide" — neither of which is true for the person it was
              written FOR. onUnlockPress is absent exactly when the reader
              cannot buy, so it doubles as "is this the owner". */}
          <Text className="text-brown-600 text-sm">
            {onUnlockPress
              ? 'This is your own sheet, written from your guide. Crown clears the watermark here and in the PDF, and lets you rewrite the sheet whenever your details change.'
              : "The content underneath is real and complete — nothing has been left out. The watermark is the owner's to clear."}
          </Text>
          {onUnlockPress ? (
            <View className="mt-3">
              {/* Deliberately not "…to remove this watermark": that label was
                  the same cosmetic-only claim as the line above, restated as
                  the last thing read before the decision. Matches
                  AICheatSheetScreen's Crown CTA. */}
              <Button
                title="👑 Unlock Crown — $5"
                onPress={onUnlockPress}
                variant="outline"
              />
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}
