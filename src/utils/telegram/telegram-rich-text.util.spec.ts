import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  markdownToTelegramHtml,
  richTextToTelegramHtml,
  richTextToTelegramRichHtml,
  telegramMessageToHtml,
} from './telegram-rich-text.util';

test('telegramMessageToHtml keeps plain text when there are no entities', () => {
  const result = telegramMessageToHtml({
    text: 'Simple text',
  });

  assert.equal(result, 'Simple text');
});

test('escapeHtml leaves strings without special characters unchanged', () => {
  const result = escapeHtml('Simple text without special characters');
  assert.equal(result, 'Simple text without special characters');
});

test('escapeHtml escapes standard &, <, and > characters correctly', () => {
  const result = escapeHtml('A & B < C > D');
  assert.equal(result, 'A &amp; B &lt; C &gt; D');
});

test('escapeHtml handles multiple occurrences of special characters', () => {
  const result = escapeHtml('<<&>>&&');
  assert.equal(result, '&lt;&lt;&amp;&gt;&gt;&amp;&amp;');
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
    caption_entities: [{ type: 'text_link', offset: 6, length: 4, url: 'https://example.com' }],
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

test('richTextToTelegramHtml preserves Telegram-safe agent HTML and escapes unsafe tags', () => {
  const result = richTextToTelegramHtml(
    '<b>Oyiga to‘lov:</b> 1 995 233 so‘m\n<script>alert(1)</script>',
  );

  assert.equal(
    result,
    '<b>Oyiga to‘lov:</b> 1 995 233 so‘m\n&lt;script&gt;alert(1)&lt;/script&gt;',
  );
});

test('richTextToTelegramRichHtml creates native paragraphs and lists', () => {
  const result = richTextToTelegramRichHtml(
    'Topildi:\n\n- <b>Model:</b> iPhone 16 Pro\n- **Narx:** 12 000 000 so‘m\n\nBuyurtma beramizmi?',
  );

  assert.equal(
    result,
    '<p>Topildi:</p><ul><li><b>Model:</b> iPhone 16 Pro</li><li><b>Narx:</b> 12 000 000 so‘m</li></ul><p>Buyurtma beramizmi?</p>',
  );
});

test('richTextToTelegramRichHtml supports headings, quotes, and dividers safely', () => {
  const result = richTextToTelegramRichHtml(
    '### Natija\n> Faqat tasdiqlangan ma’lumot\n---\n<script>alert(1)</script>',
  );

  assert.equal(
    result,
    '<h3>Natija</h3><blockquote>Faqat tasdiqlangan ma’lumot</blockquote><hr/><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  );
});

test('richTextToTelegramRichHtml converts Markdown tables to Telegram rich tables', () => {
  const result = richTextToTelegramRichHtml(
    [
      '| Model | Holati | Narxi |',
      '| :--- | :---: | ---: |',
      '| **iPhone 15 Pro** | Yangi | 12 000 000 so‘m |',
      '| iPhone 16 Pro | Ishlatilgan | 10 500 000 so‘m |',
      '',
      'Qaysi biri sizga ma’qul?',
    ].join('\n'),
  );

  assert.equal(
    result,
    '<table bordered striped><tr><th align="left">Model</th><th align="center">Holati</th><th align="right">Narxi</th></tr><tr><td align="left"><b>iPhone 15 Pro</b></td><td align="center">Yangi</td><td align="right">12 000 000 so‘m</td></tr><tr><td align="left">iPhone 16 Pro</td><td align="center">Ishlatilgan</td><td align="right">10 500 000 so‘m</td></tr></table><p>Qaysi biri sizga ma’qul?</p>',
  );
});

test('richTextToTelegramRichHtml keeps escaped and code pipes inside table cells', () => {
  const result = richTextToTelegramRichHtml(
    '| Qiymat | Izoh |\n| --- | --- |\n| A \\| B | `x | y` |',
  );

  assert.equal(
    result,
    '<table bordered striped><tr><th>Qiymat</th><th>Izoh</th></tr><tr><td>A | B</td><td><code>x | y</code></td></tr></table>',
  );
});
