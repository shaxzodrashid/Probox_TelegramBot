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
