import assert from 'node:assert/strict';
import test from 'node:test';
import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import type { Update } from 'grammy/types';
import type { BotContext, SessionData } from '../types/context';
import { i18n } from '../i18n';
import { createTelegramAuthMiddleware } from './telegram-auth.middleware';
import { TELEGRAM_AUTH_TTL_MS } from '../utils/telegram/telegram-auth.util';

function fixture() {
  const replies: Array<{ text: string; options?: unknown }> = [];
  const cleared: number[] = [];
  let exits = 0;
  let nextCalls = 0;
  let callbackAnswers = 0;
  const ctx = {
    chat: { id: 123, type: 'private' },
    from: { id: 123 },
    session: {} as SessionData,
    message: { text: '/start auth_998901234567', date: Math.floor(Date.now() / 1000) },
    t: (key: string) => i18n.t('uz', key),
    conversation: {
      exitAll: async () => {
        exits++;
      },
    },
    reply: async (text: string, options?: unknown) => {
      replies.push({ text, options });
    },
    answerCallbackQuery: async () => {
      callbackAnswers++;
    },
  } as unknown as BotContext;
  const middleware = createTelegramAuthMiddleware(async (id) => {
    cleared.push(id);
  });
  const run = () =>
    middleware(ctx, async () => {
      nextCalls++;
    });
  const contact = (phone = '+998 (90) 123-45-67', userId: number | undefined = 123) => {
    Object.defineProperty(ctx, 'message', {
      configurable: true,
      value: {
        date: Math.floor(Date.now() / 1000),
        contact: { phone_number: phone, user_id: userId, first_name: 'Test' },
      },
    });
  };
  const text = (value: string) =>
    Object.defineProperty(ctx, 'message', {
      configurable: true,
      value: { text: value, date: Math.floor(Date.now() / 1000) },
    });
  return {
    ctx,
    replies,
    cleared,
    run,
    contact,
    text,
    auth: () => ctx.session.telegramAuth,
    stats: () => ({ exits, nextCalls, callbackAnswers }),
  };
}

test('requests contact, verifies full phone and Telegram ownership, persists result, and does not reverify duplicates', async () => {
  const f = fixture();
  f.ctx.session.pendingAction = 'application';
  f.ctx.session.deepLinkSlug = 'aksiya_01';
  await f.run();
  assert.equal(f.auth()?.status, 'pending');
  assert.equal(f.ctx.session.pendingAction, undefined);
  assert.equal(f.ctx.session.deepLinkSlug, undefined);
  assert.deepEqual(f.cleared, [123]);
  assert.equal(f.stats().exits, 1);
  assert.match(JSON.stringify(f.replies[0].options), /"request_contact":true/);
  f.contact();
  await f.run();
  assert.equal(f.auth()?.status, 'verified');
  assert.equal(f.auth()?.phone_number, '+998901234567');
  assert.equal(f.auth()?.telegram_id, 123);
  assert.deepEqual(f.replies[f.replies.length - 1]?.options, {
    reply_markup: { remove_keyboard: true },
  });
  const result = { ...f.auth() };
  await f.run();
  assert.deepEqual(f.auth(), result);
  assert.equal(f.replies.length, 2);
  assert.equal(f.stats().nextCalls, 1);
});

test('rejects missing/foreign ownership, wrong country, typed numbers, forwarded and stale contacts; allows retry', async () => {
  const f = fixture();
  await f.run();
  for (const owner of [456, undefined]) {
    f.contact();
    if (f.ctx.message?.contact) f.ctx.message.contact.user_id = owner;
    await f.run();
    assert.equal(f.auth()?.status, 'pending');
    assert.equal(
      f.replies[f.replies.length - 1]?.text,
      i18n.t('uz', 'telegram_auth_own_contact_only'),
    );
  }
  for (const phone of ['+1901234567', '+998901234568', 'bad998901234567']) {
    f.contact(phone);
    await f.run();
    assert.equal(f.auth()?.status, 'pending');
    assert.equal(
      f.replies[f.replies.length - 1]?.text,
      i18n.t('uz', 'telegram_auth_phone_mismatch'),
    );
  }
  f.text('998901234567');
  await f.run();
  assert.equal(f.auth()?.status, 'pending');
  f.contact();
  Object.assign(f.ctx.message!, { forward_origin: { type: 'user' } });
  await f.run();
  assert.equal(f.auth()?.status, 'pending');
  f.contact();
  f.ctx.message!.date = 1;
  await f.run();
  assert.equal(f.auth()?.status, 'pending');
  f.contact();
  await f.run();
  assert.equal(f.auth()?.status, 'verified');
  assert.equal(f.stats().nextCalls, 0);
});

test('expired or wrong-sender attempts fail closed', async () => {
  for (const condition of ['expired', 'sender']) {
    const f = fixture();
    await f.run();
    if (condition === 'expired') f.auth()!.expires_at = Date.now();
    else f.auth()!.telegram_id = 456;
    f.contact();
    await f.run();
    assert.equal(f.auth(), undefined);
    assert.equal(f.replies[f.replies.length - 1]?.text, i18n.t('uz', 'telegram_auth_expired'));
    assert.equal(f.stats().nextCalls, 0);
  }
});

test('new starts replace verified attempts and invalid links erase previous approval', async () => {
  const f = fixture();
  await f.run();
  f.contact();
  await f.run();
  f.text('/start auth_998901234568');
  await f.run();
  assert.equal(f.auth()?.status, 'pending');
  assert.equal(f.auth()?.phone_number, '+998901234568');
  f.text('/start auth_bad');
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.equal(f.replies[f.replies.length - 1]?.text, i18n.t('uz', 'telegram_auth_invalid_link'));
});

test('cancel and normal/promo starts clear attempts while unrelated updates pass through', async () => {
  for (const command of ['/cancel@example_bot', '/start', '/start aksiya_01']) {
    const f = fixture();
    await f.run();
    f.text(command);
    await f.run();
    assert.equal(f.auth(), undefined);
    assert.equal(f.stats().nextCalls, command.startsWith('/cancel') ? 0 : 1);
  }
  const f = fixture();
  f.text('/start aksiya_01');
  await f.run();
  assert.equal(f.stats().nextCalls, 1);
  assert.equal(f.stats().exits, 0);
});

test('private-chat restriction consumes auth links but leaves ordinary group updates alone', async () => {
  const f = fixture();
  Object.assign(f.ctx.chat!, { type: 'group' });
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.equal(f.replies[f.replies.length - 1]?.text, i18n.t('uz', 'telegram_auth_private_only'));
  assert.equal(f.stats().nextCalls, 0);
  f.text('hello');
  await f.run();
  assert.equal(f.stats().nextCalls, 1);
});

test('auth runs before actual conversation replay and Redis-compatible session serialization retains pending state', async () => {
  const bot = new Bot<BotContext>('123:test', {
    botInfo: {
      id: 999,
      is_bot: true,
      first_name: 'Bot',
      username: 'example_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
    },
  });
  const data = new Map<string, string>();
  const storage = {
    read: async (key: string) =>
      data.has(key) ? (JSON.parse(data.get(key)!) as SessionData) : undefined,
    write: async (key: string, value: SessionData) => {
      data.set(key, JSON.stringify(value));
    },
    delete: async (key: string) => {
      data.delete(key);
    },
  };
  bot.use(session({ initial: () => ({}), storage }));
  bot.use(i18n);
  bot.use(conversations());
  bot.use(createTelegramAuthMiddleware(async () => {}));
  let conversationContacts = 0;
  bot.use(
    createConversation(async (conversation) => {
      await conversation.waitFor('message:contact');
      conversationContacts++;
    }, 'ordinary'),
  );
  bot.command('ordinary', (ctx) => ctx.conversation.enter('ordinary'));
  const texts: string[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === 'sendMessage') texts.push((payload as { text: string }).text);
    return {
      ok: true,
      result: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123, type: 'private' },
      },
    } as never;
  });
  let updateId = 0;
  async function update(content: object) {
    const entities =
      'text' in content
        ? [{ type: 'bot_command', offset: 0, length: String(content.text).split(' ')[0].length }]
        : undefined;
    await bot.handleUpdate({
      update_id: ++updateId,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123, type: 'private', first_name: 'Test' },
        from: { id: 123, is_bot: false, first_name: 'Test' },
        entities,
        ...content,
      },
    } as Update);
  }
  await update({ text: '/ordinary' });
  await update({ text: '/start auth_998901234567' });
  assert.equal(JSON.parse(data.get('123')!).telegramAuth.status, 'pending');
  await update({ contact: { phone_number: '998901234567', user_id: 123, first_name: 'Test' } });
  assert.equal(conversationContacts, 0);
  const auth = JSON.parse(data.get('123')!).telegramAuth;
  assert.equal(auth.status, 'verified');
  assert.equal(auth.expires_at - auth.verified_at, TELEGRAM_AUTH_TTL_MS);
  assert.equal(texts[texts.length - 1], i18n.t('uz', 'telegram_auth_verified'));
  // Later ordinary conversations must still receive their own contact updates.
  await update({ text: '/ordinary' });
  await update({ contact: { phone_number: '998901234567', user_id: 123, first_name: 'Test' } });
  assert.equal(conversationContacts, 1);
  assert.deepEqual(JSON.parse(data.get('123')!).telegramAuth, auth);
});

test('menu start cancels verification and pending callbacks cannot reach other flows', async () => {
  const f = fixture();
  await f.run();
  Object.defineProperty(f.ctx, 'message', { configurable: true, value: undefined });
  Object.defineProperty(f.ctx, 'callbackQuery', {
    configurable: true,
    value: { data: 'old_menu_button' },
  });
  await f.run();
  assert.equal(f.stats().callbackAnswers, 1);
  assert.equal(f.stats().nextCalls, 0);
  assert.equal(f.auth()?.status, 'pending');
  Object.defineProperty(f.ctx, 'callbackQuery', { configurable: true, value: { data: 'start' } });
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.equal(f.stats().nextCalls, 1);
});

test('successful verification expires and contacts without an attempt stay available to ordinary registration', async () => {
  const f = fixture();
  f.contact();
  await f.run();
  assert.equal(f.stats().nextCalls, 1);
  assert.equal(f.auth(), undefined);
  f.text('/start auth_998901234567');
  await f.run();
  f.contact();
  await f.run();
  f.auth()!.expires_at = Date.now();
  f.text('/help');
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.equal(f.stats().nextCalls, 2);
});

test('all auth messages resolve in both supported locales', () => {
  for (const locale of ['uz', 'ru']) {
    for (const key of [
      'request_contact',
      'own_contact_only',
      'phone_mismatch',
      'invalid_link',
      'private_only',
      'expired',
      'cancelled',
      'verified',
    ]) {
      const fullKey = `telegram_auth_${key}`;
      assert.notEqual(i18n.t(locale, fullKey), fullKey);
    }
  }
});
