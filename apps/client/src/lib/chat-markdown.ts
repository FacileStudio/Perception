function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function sanitizeUrl(value: string): string | null {
  const trimmed = value.trim().replace(/^<|>$/g, '');
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function renderInlineText(value: string): string {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__/g;
  let html = '';
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += escapeHtml(value.slice(lastIndex, index));

    const [fullMatch, label, url, boldA, boldB] = match;
    if (label && url) {
      const safeUrl = sanitizeUrl(url);
      const safeLabel = renderInline(label);
      html += safeUrl
        ? `<a href="${escapeAttr(safeUrl)}" target="_blank" rel="noreferrer">${safeLabel}</a>`
        : safeLabel;
    } else {
      html += `<strong>${renderInline(boldA ?? boldB ?? fullMatch)}</strong>`;
    }

    lastIndex = index + fullMatch.length;
  }

  html += escapeHtml(value.slice(lastIndex));
  return html;
}

function renderInline(value: string): string {
  const pattern = /`([^`]+)`/g;
  let html = '';
  let lastIndex = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    html += renderInlineText(value.slice(lastIndex, index));
    html += `<code>${escapeHtml(match[1])}</code>`;
    lastIndex = index + match[0].length;
  }

  html += renderInlineText(value.slice(lastIndex));
  return html;
}

function renderInlineWithBreaks(value: string): string {
  return value
    .split('\n')
    .map((line) => renderInline(line))
    .join('<br />');
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function isFence(line: string): boolean {
  return /^```/.test(line.trim());
}

function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function headingLevel(line: string): number | null {
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
  if (!match) {
    return null;
  }
  return Math.min(match[1].length + 1, 4);
}

function isBlockquote(line: string): boolean {
  return /^\s{0,3}>\s?/.test(line);
}

function isUnorderedListItem(line: string): boolean {
  return /^\s*[-+*]\s+/.test(line);
}

function isOrderedListItem(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(lines[index]?.includes('|') && lines[index + 1] && isTableSeparator(lines[index + 1]));
}

function isSpecialBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  return (
    isFence(line) ||
    isHorizontalRule(line) ||
    headingLevel(line) !== null ||
    isBlockquote(line) ||
    isUnorderedListItem(line) ||
    isOrderedListItem(line) ||
    isTableStart(lines, index)
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function padRow(row: string[], length: number): string[] {
  return [...row, ...Array.from({ length: Math.max(length - row.length, 0) }, () => '')];
}

function renderTable(lines: string[], index: number): { html: string; nextIndex: number } {
  const headers = splitTableRow(lines[index]);
  const rows: string[][] = [];
  let nextIndex = index + 2;

  while (nextIndex < lines.length && !isBlank(lines[nextIndex]) && lines[nextIndex].includes('|')) {
    rows.push(splitTableRow(lines[nextIndex]));
    nextIndex += 1;
  }

  const width = Math.max(headers.length, ...rows.map((row) => row.length));
  const safeHeaders = padRow(headers, width);
  const safeRows = rows.map((row) => padRow(row, width));

  const thead = `<thead><tr>${safeHeaders.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = safeRows.length
    ? `<tbody>${safeRows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
    : '';

  return {
    html: `<div class="chat-md-table"><table>${thead}${tbody}</table></div>`,
    nextIndex,
  };
}

function renderList(lines: string[], index: number): { html: string; nextIndex: number } {
  const ordered = isOrderedListItem(lines[index]);
  const tag = ordered ? 'ol' : 'ul';
  const items: string[] = [];
  let currentIndex = index;

  while (currentIndex < lines.length) {
    const line = lines[currentIndex];
    const match = ordered ? line.match(/^\s*\d+\.\s+(.+)$/) : line.match(/^\s*[-+*]\s+(.+)$/);
    if (match) {
      items.push(match[1]);
      currentIndex += 1;
      continue;
    }
    if (
      items.length > 0 &&
      /^\s{2,}\S/.test(line) &&
      !isSpecialBlockStart(lines, currentIndex) &&
      !isBlank(line)
    ) {
      items[items.length - 1] += `\n${line.trim()}`;
      currentIndex += 1;
      continue;
    }
    break;
  }

  return {
    html: `<${tag}>${items.map((item) => `<li>${renderInlineWithBreaks(item)}</li>`).join('')}</${tag}>`,
    nextIndex: currentIndex,
  };
}

function renderBlockquote(lines: string[], index: number): { html: string; nextIndex: number } {
  const quoteLines: string[] = [];
  let currentIndex = index;

  while (currentIndex < lines.length && isBlockquote(lines[currentIndex])) {
    quoteLines.push(lines[currentIndex].replace(/^\s{0,3}>\s?/, ''));
    currentIndex += 1;
  }

  return {
    html: `<blockquote>${renderBlocks(quoteLines).join('')}</blockquote>`,
    nextIndex: currentIndex,
  };
}

function renderFence(lines: string[], index: number): { html: string; nextIndex: number } {
  const codeLines: string[] = [];
  let currentIndex = index + 1;

  while (currentIndex < lines.length && !isFence(lines[currentIndex])) {
    codeLines.push(lines[currentIndex]);
    currentIndex += 1;
  }

  return {
    html: `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    nextIndex: currentIndex < lines.length ? currentIndex + 1 : currentIndex,
  };
}

function renderParagraph(lines: string[], index: number): { html: string; nextIndex: number } {
  const paragraphLines: string[] = [];
  let currentIndex = index;

  while (
    currentIndex < lines.length &&
    !isBlank(lines[currentIndex]) &&
    !isSpecialBlockStart(lines, currentIndex)
  ) {
    paragraphLines.push(lines[currentIndex]);
    currentIndex += 1;
  }

  return {
    html: `<p>${renderInlineWithBreaks(paragraphLines.join('\n'))}</p>`,
    nextIndex: currentIndex,
  };
}

function renderBlocks(lines: string[]): string[] {
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const block = renderFence(lines, index);
      html.push(block.html);
      index = block.nextIndex;
      continue;
    }

    if (isHorizontalRule(line)) {
      html.push('<hr />');
      index += 1;
      continue;
    }

    const level = headingLevel(line);
    if (level !== null) {
      const text = line.replace(/^\s{0,3}#{1,6}\s+/, '');
      html.push(`<h${level}>${renderInline(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const block = renderTable(lines, index);
      html.push(block.html);
      index = block.nextIndex;
      continue;
    }

    if (isBlockquote(line)) {
      const block = renderBlockquote(lines, index);
      html.push(block.html);
      index = block.nextIndex;
      continue;
    }

    if (isUnorderedListItem(line) || isOrderedListItem(line)) {
      const block = renderList(lines, index);
      html.push(block.html);
      index = block.nextIndex;
      continue;
    }

    const block = renderParagraph(lines, index);
    html.push(block.html);
    index = block.nextIndex;
  }

  return html;
}

export function renderChatMarkdown(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return '';
  }
  return renderBlocks(normalized.split('\n')).join('');
}
