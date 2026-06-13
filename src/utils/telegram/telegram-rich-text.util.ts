import { MessageEntity } from 'grammy/types';

type TelegramEntityLike = MessageEntity & {
  user?: {
    id: number;
  };
  url?: string;
  language?: string;
};

type MessageLike = {
  text?: string;
  caption?: string;
  entities?: TelegramEntityLike[];
  caption_entities?: TelegramEntityLike[];
};

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttribute = (value: string): string => escapeHtml(value).replace(/"/g, '&quot;');

const wrapEntity = (entity: TelegramEntityLike, inner: string, rawText: string): string => {
  switch (entity.type) {
    case 'bold':
      return `<b>${inner}</b>`;
    case 'italic':
      return `<i>${inner}</i>`;
    case 'underline':
      return `<u>${inner}</u>`;
    case 'strikethrough':
      return `<s>${inner}</s>`;
    case 'spoiler':
      return `<tg-spoiler>${inner}</tg-spoiler>`;
    case 'text_link':
      return entity.url ? `<a href="${escapeAttribute(entity.url)}">${inner}</a>` : inner;
    case 'text_mention':
      return entity.user?.id ? `<a href="tg://user?id=${entity.user.id}">${inner}</a>` : inner;
    case 'url':
      return `<a href="${escapeAttribute(rawText)}">${inner}</a>`;
    case 'code':
      return `<code>${escapeHtml(rawText)}</code>`;
    case 'pre':
      return entity.language
        ? `<pre language="${escapeAttribute(entity.language)}">${escapeHtml(rawText)}</pre>`
        : `<pre>${escapeHtml(rawText)}</pre>`;
    default:
      return inner;
  }
};

const renderRange = (
  text: string,
  entities: TelegramEntityLike[],
  rangeStart: number,
  rangeEnd: number,
): string => {
  const relevant = entities
    .filter((entity) => entity.offset >= rangeStart && entity.offset + entity.length <= rangeEnd)
    .sort((left, right) => {
      if (left.offset !== right.offset) {
        return left.offset - right.offset;
      }
      return right.length - left.length;
    });

  let output = '';
  let cursor = rangeStart;
  let index = 0;

  while (index < relevant.length) {
    const entity = relevant[index];

    if (entity.offset < cursor) {
      index += 1;
      continue;
    }

    if (entity.offset > cursor) {
      output += escapeHtml(text.slice(cursor, entity.offset));
      cursor = entity.offset;
    }

    const entityEnd = entity.offset + entity.length;
    const nestedEntities = relevant.filter(
      (candidate) =>
        candidate !== entity &&
        candidate.offset >= entity.offset &&
        candidate.offset + candidate.length <= entityEnd,
    );
    const rawEntityText = text.slice(entity.offset, entityEnd);
    const inner =
      entity.type === 'code' || entity.type === 'pre'
        ? escapeHtml(rawEntityText)
        : renderRange(text, nestedEntities, entity.offset, entityEnd);

    output += wrapEntity(entity, inner, rawEntityText);
    cursor = entityEnd;

    while (index < relevant.length && relevant[index].offset < cursor) {
      index += 1;
    }
  }

  if (cursor < rangeEnd) {
    output += escapeHtml(text.slice(cursor, rangeEnd));
  }

  return output;
};

export const telegramMessageToHtml = (message: MessageLike): string => {
  const text = message.text ?? message.caption ?? '';
  const entities = (message.text ? message.entities : message.caption_entities) ?? [];

  if (!text) {
    return '';
  }

  if (!entities.length) {
    return escapeHtml(text);
  }

  return renderRange(text, entities, 0, text.length);
};

const applyMarkdownToTelegramHtml = (html: string): string => {
  // Markdown Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  // Markdown Italic: *text* or _text_ (excluding bold).
  html = html.replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<i>$1</i>');
  html = html.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<i>$1</i>');

  // Markdown Code inline: `text`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Markdown links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return html;
};

const restoreAllowedTelegramHtmlTags = (html: string): string =>
  html
    .replace(
      /&lt;(\/?)(b|strong|i|em|u|ins|s|strike|del|code|pre|tg-spoiler)&gt;/gi,
      (_match, closing: string, tag: string) => `<${closing}${tag.toLowerCase()}>`,
    )
    .replace(
      /&lt;pre language="([a-z0-9_+-]+)"&gt;/gi,
      (_match, language: string) => `<pre language="${escapeAttribute(language)}">`,
    );

export const markdownToTelegramHtml = (text: string): string => {
  // First escape all existing HTML to prevent raw injection,
  // since Telegram HTML parse mode only supports specific tags.
  return applyMarkdownToTelegramHtml(escapeHtml(text));
};

export const richTextToTelegramHtml = (text: string): string =>
  applyMarkdownToTelegramHtml(restoreAllowedTelegramHtmlTags(escapeHtml(text)));

const formatRichInlineText = (text: string): string => richTextToTelegramHtml(text.trim());

type MarkdownTableAlignment = 'left' | 'center' | 'right' | null;

const parseMarkdownTableRow = (line: string): string[] | null => {
  let value = line.trim();

  if (!value.includes('|')) {
    return null;
  }

  if (value.startsWith('|')) {
    value = value.slice(1);
  }
  if (value.endsWith('|') && !value.endsWith('\\|')) {
    value = value.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = '';
  let inCode = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === '\\' && value[index + 1] === '|') {
      cell += '|';
      index += 1;
      continue;
    }

    if (character === '`') {
      inCode = !inCode;
      cell += character;
      continue;
    }

    if (character === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }

    cell += character;
  }

  cells.push(cell.trim());
  return cells;
};

const parseMarkdownTableAlignment = (value: string): MarkdownTableAlignment | undefined => {
  const separator = value.trim();

  if (!/^:?-{3,}:?$/.test(separator)) {
    return undefined;
  }

  if (separator.startsWith(':') && separator.endsWith(':')) {
    return 'center';
  }
  if (separator.endsWith(':')) {
    return 'right';
  }
  if (separator.startsWith(':')) {
    return 'left';
  }

  return null;
};

const renderRichTableCell = (
  tag: 'th' | 'td',
  value: string,
  alignment: MarkdownTableAlignment,
): string => {
  const alignmentAttribute = alignment ? ` align="${alignment}"` : '';
  return `<${tag}${alignmentAttribute}>${formatRichInlineText(value)}</${tag}>`;
};

const parseMarkdownTable = (
  lines: string[],
  startIndex: number,
): { html: string; nextIndex: number } | null => {
  const header = parseMarkdownTableRow(lines[startIndex] ?? '');
  const separator = parseMarkdownTableRow(lines[startIndex + 1] ?? '');

  if (!header || !separator || header.length < 2 || separator.length !== header.length) {
    return null;
  }

  const alignments = separator.map(parseMarkdownTableAlignment);
  if (alignments.some((alignment) => alignment === undefined)) {
    return null;
  }

  const resolvedAlignments = alignments as MarkdownTableAlignment[];
  const rows: string[][] = [];
  let nextIndex = startIndex + 2;

  while (nextIndex < lines.length && lines[nextIndex].trim()) {
    const row = parseMarkdownTableRow(lines[nextIndex]);
    if (!row || row.length !== header.length) {
      break;
    }

    rows.push(row);
    nextIndex += 1;
  }

  const headerHtml = header
    .map((cell, index) => renderRichTableCell('th', cell, resolvedAlignments[index]))
    .join('');
  const rowsHtml = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => renderRichTableCell('td', cell, resolvedAlignments[index]))
          .join('')}</tr>`,
    )
    .join('');

  return {
    html: `<table bordered striped><tr>${headerHtml}</tr>${rowsHtml}</table>`,
    nextIndex,
  };
};

export const richTextToTelegramRichHtml = (text: string): string => {
  const blocks: string[] = [];
  const paragraphLines: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push(`<p>${paragraphLines.map(formatRichInlineText).join('<br>')}</p>`);
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!list) {
      return;
    }

    const tag = list.ordered ? 'ol' : 'ul';
    blocks.push(`<${tag}>${list.items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`);
    list = null;
  };

  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const table = parseMarkdownTable(lines, lineIndex);
    if (table) {
      flushParagraph();
      flushList();
      blocks.push(table.html);
      lineIndex = table.nextIndex - 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${formatRichInlineText(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push('<hr/>');
      continue;
    }

    const unorderedItem = line.match(/^[-*•]\s+(.+)$/);
    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/);
    if (unorderedItem || orderedItem) {
      flushParagraph();
      const ordered = Boolean(orderedItem);

      if (list && list.ordered !== ordered) {
        flushList();
      }

      list ??= { ordered, items: [] };
      list.items.push(formatRichInlineText((orderedItem || unorderedItem)![1]));
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${formatRichInlineText(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks.join('') || '<p></p>';
};
