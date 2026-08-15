import { View, Text, Image } from 'react-native';
import { Card } from './Card';
import { SecurityNote } from './SecurityNote';
import { fillCheatSheetTokens } from '../lib/cheatSheetTokens';
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
}

// Simple markdown-to-text renderer for display
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

export function CheatSheetView({ content, homeInfo, generatedAt }: CheatSheetViewProps) {
  return (
    <Card className="mb-4">
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
    </Card>
  );
}
