import test from 'node:test';
import assert from 'node:assert/strict';
import { telegramMessageToHtml } from './telegram-rich-text.util';

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
