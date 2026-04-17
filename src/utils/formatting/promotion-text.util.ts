import { escapeHtml } from '../telegram/telegram-rich-text.util';

const htmlToVisibleText = (value: string): string =>
  value
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const normalizeVisibleText = (value: string): string => value.replace(/\s+/g, ' ').trim();

const stripLeadingDuplicateHeading = (title: string, htmlBody: string): string => {
  const normalizedTitle = normalizeVisibleText(title);
  if (!normalizedTitle) {
    return htmlBody;
  }

  const visibleBody = htmlToVisibleText(htmlBody);
  const [firstVisibleLine = ''] = visibleBody.split(/\r?\n/);
  if (normalizeVisibleText(firstVisibleLine) !== normalizedTitle) {
    return htmlBody;
  }

  const rawLines = htmlBody.split(/\r?\n/);
  const firstContentLineIndex = rawLines.findIndex((line) => line.trim().length > 0);
  if (firstContentLineIndex < 0) {
    return '';
  }

  if (normalizeVisibleText(htmlToVisibleText(rawLines[firstContentLineIndex])) !== normalizedTitle) {
    return htmlBody;
  }

  let nextLineIndex = firstContentLineIndex + 1;
  while (nextLineIndex < rawLines.length && rawLines[nextLineIndex].trim().length === 0) {
    nextLineIndex += 1;
  }

  return rawLines.slice(nextLineIndex).join('\n');
};

export const buildPromotionText = (title: string, htmlBody: string): string => {
  const body = stripLeadingDuplicateHeading(title, htmlBody);
  if (!body.trim()) {
    return `<b>${escapeHtml(title)}</b>`;
  }

  return `<b>${escapeHtml(title)}</b>\n\n${body}`;
};

export const getPromotionCaptionLength = (title: string, htmlBody: string): number => {
  const body = stripLeadingDuplicateHeading(title, htmlBody);
  if (!body.trim()) {
    return title.length;
  }

  return `${title}\n\n${htmlToVisibleText(body)}`.length;
};
