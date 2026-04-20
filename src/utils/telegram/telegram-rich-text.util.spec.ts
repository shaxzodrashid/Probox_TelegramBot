import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToTelegramHtml, telegramMessageToHtml } from './telegram-rich-text.util';

test('telegramMessageToHtml keeps plain text when there are no entities', () => {
  const result = telegramMessageToHtml({
    text: 'Simple text',
  });

  assert.equal(result, 'Simple text');
});

test('telegramMessageToHtml converts nested formatting to Telegram HTML', () => {
  const text = 'Hello world';
  const result = telegramMessageToHtml({
    text,
    entities: [
      { type: 'bold', offset: 0, length: text.length },
      { type: 'italic', offset: 6, length: 5 },
    ],
  });

  assert.equal(result, '<b>Hello <i>world</i></b>');
});

test('telegramMessageToHtml supports caption entities and links', () => {
  const text = 'Visit site';
  const result = telegramMessageToHtml({
    caption: text,
    caption_entities: [
      { type: 'text_link', offset: 6, length: 4, url: 'https://example.com' },
    ],
  });

  assert.equal(result, 'Visit <a href="https://example.com">site</a>');
});

test('markdownToTelegramHtml converts bold markdown for Telegram HTML parse mode', () => {
  const result = markdownToTelegramHtml(
    'Tushundim. **iPhone 16 Pro 128GB White (yangi)** modeli bo‘yicha aniqlab beraman.',
  );

  assert.equal(
    result,
    'Tushundim. <b>iPhone 16 Pro 128GB White (yangi)</b> modeli bo‘yicha aniqlab beraman.',
  );
});
