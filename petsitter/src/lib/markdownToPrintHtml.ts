/**
 * Turn the markdown an LLM writes for a cheat sheet into printable HTML.
 *
 * The PDF export used to HTML-escape the sheet and replace newlines with
 * <br>, so a printed page read "## Feeding Schedule" and "**Rex**" literally —
 * the markdown syntax was visible and the structure was not. The on-screen
 * CheatSheetView has had a renderer all along; the PDF never got one.
 *
 * ESCAPING HAPPENS ONCE, FIRST, ON THE WHOLE INPUT.
 *
 * That ordering is the security property, not a style choice. This text
 * contains real user data — pet names, medication notes, a home address — and
 * it is about to become HTML in a document we hand to someone. Escaping up
 * front means every branch below is operating on text that is already inert,
 * so a branch that forgets to escape cannot exist. The reverse order (build
 * HTML, escape the pieces) puts the burden on remembering, and the first draft
 * of this file proved the point by escaping in four branches and forgetting the
 * fifth — the table row, which is exactly where user punctuation collects.
 *
 * Escaping first is safe because escaping does not touch the markdown syntax
 * characters (# * - _ |), so every rule below still matches.
 */
export function markdownToPrintHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Bold BEFORE italic. The other way round, `**x**` matches the italic rule
  // first and comes out as <em>*x*</em>.
  //
  // The italic rules deliberately require a non-word character on the outside,
  // so `crown_until` and `snake_case_name` in a note survive intact — the
  // naive /_(.*?)_/ turns them into markup.
  const inline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)\*(\S(?:.*?\S)?)\*(?=\W|$)/g, '$1<em>$2</em>')
      .replace(/(^|\W)_(\S(?:.*?\S)?)_(?=\W|$)/g, '$1<em>$2</em>');

  const out: string[] = [];
  // One entry per OPEN list level. Each open level also has exactly one open
  // <li>, which is what a nested list has to live inside for the HTML to be
  // valid — a <ul> as a direct child of <ul> renders, but indents wrongly in
  // print and is not what the spec allows.
  const stack: ('ul' | 'ol')[] = [];

  const closeToDepth = (depth: number) => {
    while (stack.length > depth) {
      out.push('</li>', `</${stack.pop()}>`);
    }
  };

  const item = (kind: 'ul' | 'ol', depth: number, text: string) => {
    closeToDepth(depth + 1);
    if (stack.length === depth + 1) {
      // Sibling at this level: close the previous item, open the next.
      out.push('</li><li>');
    } else {
      // Deeper: the new list opens INSIDE the currently open <li>.
      stack.push(kind);
      out.push(`<${kind}><li>`);
    }
    out.push(inline(text));
  };

  for (const raw of escaped.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (trimmed === '') {
      closeToDepth(0);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeToDepth(0);
      out.push('<hr>');
      continue;
    }

    // Table rows. The prompt forbids tables, but a model that emits one anyway
    // must not put raw pipes in front of a reader.
    if (trimmed.startsWith('|')) {
      if (/^\|[\s\-:|]+\|?$/.test(trimmed)) continue; // separator row
      const cells = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length === 0) continue;
      closeToDepth(0);
      if (cells.length >= 2) {
        const label = inline(cells[0].replace(/\*\*/g, ''));
        out.push(`<p><strong>${label}:</strong> ${inline(cells.slice(1).join(' · '))}</p>`);
      } else {
        out.push(`<p>${inline(cells[0])}</p>`);
      }
      continue;
    }

    // Headings. The space after the hashes is required, so a "#hashtag" in a
    // note stays a hashtag. # and ## both become h2 — the document supplies
    // its own h1.
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeToDepth(0);
      const tag = heading[1].length === 3 ? 'h3' : 'h2';
      out.push(`<${tag}>${inline(heading[2])}</${tag}>`);
      continue;
    }

    const leading = line.length - line.replace(/^ +/, '').length;
    const depth = Math.min(Math.floor(leading / 2), 3);

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      item('ul', depth, bullet[1]);
      continue;
    }

    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ordered) {
      item('ol', depth, ordered[1]);
      continue;
    }

    closeToDepth(0);
    out.push(`<p>${inline(trimmed)}</p>`);
  }

  closeToDepth(0);
  return out.join('');
}
