/**
 * Turn the markdown an LLM writes for a cheat sheet into readable PLAIN TEXT.
 *
 * The 📋 Copy button put raw markdown on the clipboard, so pasting into
 * Messages or email showed "## Feeding Schedule" and "**Rex**" as literal
 * noise — in the one place the text has no renderer to hide behind.
 *
 * Sibling of markdownToPrintHtml, and deliberately NOT built on it: HTML needs
 * escaping and structure, plain text needs indentation and blank lines, and the
 * two go opposite ways often enough that sharing a parser would help neither.
 *
 * No escaping here on purpose. This output goes to a clipboard as text and
 * never into markup, so there is no injection surface to defend.
 */
export function markdownToPlainText(markdown: string): string {
  // Bold BEFORE italic: the other way round, `**x**` matches the italic rule
  // and comes out as `*x*`.
  //
  // The italic rules require a non-word character (or the string edge) on BOTH
  // outsides, so `crown_until` and `snake_case` survive. The first draft put
  // its second lookbehind before the CLOSING marker, which asks the last letter
  // of the word not to be a letter — so `*italic*` never matched and italics
  // were never stripped at all.
  const inline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(^|\W)\*(\S(?:.*?\S)?)\*(?=\W|$)/g, '$1$2')
      .replace(/(^|\W)_(\S(?:.*?\S)?)_(?=\W|$)/g, '$1$2');

  const out: string[] = [];
  /** Push a blank line unless one is already there, or we are at the top. */
  const blank = () => {
    if (out.length && out[out.length - 1] !== '') out.push('');
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (trimmed === '') {
      blank();
      continue;
    }

    // Divider
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blank();
      out.push('-'.repeat(40));
      blank();
      continue;
    }

    // Table rows. The separator test allows an optional trailing pipe —
    // `|---|---|` is the shape models actually emit, and the first draft's
    // pattern rejected it and printed "---: ---" into the sheet.
    if (trimmed.startsWith('|')) {
      if (/^\|[\s\-:|]+\|?$/.test(trimmed)) continue;
      const cells = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length === 0) continue;
      out.push(
        cells.length >= 2
          ? `${inline(cells[0])}: ${inline(cells.slice(1).join(' - '))}`
          : inline(cells[0])
      );
      continue;
    }

    // Headings. The space after the hashes is required, so "#hashtag" in a
    // note stays a hashtag.
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blank();
      out.push(inline(heading[2]));
      continue;
    }

    const leading = line.length - line.replace(/^ +/, '').length;
    const indent = '  '.repeat(Math.min(Math.floor(leading / 2), 3));

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      out.push(`${indent}• ${inline(bullet[1])}`);
      continue;
    }

    // The author's own numbering is kept rather than renumbered — a sheet that
    // says "step 3" should still say 3 after a copy.
    const ordered = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (ordered) {
      out.push(`${indent}${ordered[1]}. ${inline(ordered[2])}`);
      continue;
    }

    out.push(inline(trimmed));
  }

  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}
