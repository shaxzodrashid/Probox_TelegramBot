import assert from 'node:assert/strict';
import test from 'node:test';
import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import type { Update } from 'grammy/types';
import type { BotContext, SessionData } from '../types/context';
import { i18n } from '../i18n';
import { createTelegramAuthMiddleware } from './telegram-auth.middleware';
import {
  ProboxLoginApi,
  ProboxLoginError,
  ProboxLoginOpenResult,
  ProboxLoginConfirmInput,
} from '../services/probox-login.service';

const loginId = '3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b';
const anotherId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
function openResult(id = loginId): ProboxLoginOpenResult {
  return {
    login_id: id,
    status: 'opened',
    phone_masked: '+998 90 *** ** 67',
    language: 'uz',
    client: { device_type: 'desktop', browser: 'Chrome', os: 'macOS' },
    location: { country_code: 'UZ', country: 'Uzbekistan', city: 'Tashkent' },
    requested_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    expires_in: 300,
  };
}
function fixture(locale = 'uz') {
  const replies: Array<{ text: string; options?: unknown }> = [];
  const opened: Array<[string, number]> = [];
  const confirmed: ProboxLoginConfirmInput[] = [];
  const declined: unknown[] = [];
  const cleared: number[] = [];
  let exits = 0,
    nextCalls = 0,
    callbackAnswers = 0;
  const api: ProboxLoginApi = {
    open: async (id, user) => {
      opened.push([id, user]);
      return openResult(id);
    },
    confirm: async (input) => {
      confirmed.push(input);
      return { login_id: input.login_id, status: 'confirmed' };
    },
    decline: async (id, user, reason) => {
      declined.push([id, user, reason]);
      return { login_id: id, status: 'declined' };
    },
  };
  const ctx = {
    chat: { id: 123, type: 'private' },
    from: { id: 123, first_name: 'Ali', last_name: 'Test', username: 'ali', language_code: 'uz' },
    session: {} as SessionData,
    message: { text: `/start auth_${loginId}`, date: Math.floor(Date.now() / 1000) },
    t: (key: string, args?: Record<string, string>) => i18n.t(locale, key, args),
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
  }, api);
  const run = () =>
    middleware(ctx, async () => {
      nextCalls++;
    });
  const message = (value: object | undefined) =>
    Object.defineProperty(ctx, 'message', { configurable: true, value });
  const text = (value: string) => message({ text: value, date: Math.floor(Date.now() / 1000) });
  const contact = (phone = '+998 (90) 123-45-67') =>
    message({
      date: Math.floor(Date.now() / 1000),
      contact: { phone_number: phone, user_id: 123, first_name: 'Contact name' },
    });
  return {
    ctx,
    api,
    replies,
    opened,
    confirmed,
    declined,
    cleared,
    run,
    text,
    contact,
    message,
    auth: () => ctx.session.telegramAuth,
    last: () => replies[replies.length - 1],
    stats: () => ({ exits, nextCalls, callbackAnswers }),
  };
}

test('open precedes contact request, displays details and warning, and retains server expiry', async () => {
  const f = fixture();
  const result = openResult();
  f.api.open = async (id, user) => {
    assert.equal(f.replies.length, 0);
    f.opened.push([id, user]);
    return result;
  };
  f.ctx.session.pendingAction = 'application';
  f.ctx.session.deepLinkSlug = 'aksiya_01';
  await f.run();
  assert.deepEqual(f.opened, [[loginId, 123]]);
  assert.equal(f.auth()?.status, 'pending');
  assert.equal(f.auth()?.expires_at, Date.parse(result.expires_at));
  assert.equal(f.ctx.session.pendingAction, undefined);
  assert.equal(f.ctx.session.deepLinkSlug, undefined);
  assert.deepEqual(f.cleared, [123]);
  assert.equal(f.stats().exits, 1);
  for (const value of ['+998 90 *** ** 67', 'Chrome', 'macOS', 'Tashkent', 'hech kimga'])
    assert.ok(f.last().text.includes(value));
  assert.match(JSON.stringify(f.last().options), /"request_contact":true/);
  assert.ok(JSON.stringify(f.last().options).includes(i18n.t('uz', 'telegram_auth_not_me')));
});

test('escapes remote details and omits unavailable metadata lines', async () => {
  const f = fixture();
  const result = openResult();
  result.phone_masked = '<phone>';
  result.client.browser = '<b>bad</b>';
  result.client.os = null;
  result.client.device_type = null;
  result.location = { country: null, city: null, country_code: null };
  f.api.open = async () => result;
  await f.run();
  assert.ok(f.last().text.includes('&lt;phone&gt;'));
  assert.ok(f.last().text.includes('&lt;b&gt;bad&lt;/b&gt;'));
  assert.ok(!f.last().text.includes('Joylashuv:'));
});

test('only successful confirm verifies; sends the unmodified contact phone and sender audit fields', async () => {
  const f = fixture();
  await f.run();
  f.contact();
  await f.run();
  assert.deepEqual(f.confirmed, [
    {
      login_id: loginId,
      telegram_user_id: 123,
      phone_number: '+998 (90) 123-45-67',
      first_name: 'Ali',
      last_name: 'Test',
      username: 'ali',
      language_code: 'uz',
    },
  ]);
  assert.equal(f.auth()?.status, 'verified');
  assert.deepEqual(f.last().options, { reply_markup: { remove_keyboard: true } });
  const verified = { ...f.auth() };
  await f.run();
  assert.deepEqual(f.auth(), verified);
  assert.equal(f.confirmed.length, 1);
  assert.equal(f.stats().nextCalls, 1);
});

test('unowned, forwarded, old and typed contacts never reach confirm; valid retries do', async () => {
  const f = fixture();
  await f.run();
  for (const owner of [456, undefined]) {
    f.contact();
    f.ctx.message!.contact!.user_id = owner;
    await f.run();
  }
  f.contact();
  Object.assign(f.ctx.message!, { forward_origin: { type: 'user' } });
  await f.run();
  f.contact();
  f.ctx.message!.date = 1;
  await f.run();
  f.text('998901234567');
  await f.run();
  assert.equal(f.confirmed.length, 0);
  assert.equal(f.auth()?.status, 'pending');
  f.contact();
  await f.run();
  assert.equal(f.confirmed.length, 1);
});

test('confirm 4xx ends the attempt and maps every documented location without remote messages', async () => {
  const cases: Array<[number, string, string]> = [
    [409, 'TG_LOGIN_PHONE_MISMATCH', 'phone_mismatch'],
    [403, 'TG_LOGIN_OTHER_ACCOUNT', 'other_account'],
    [404, 'TG_LOGIN_NOT_FOUND', 'invalid_link'],
    [410, 'TG_LOGIN_EXPIRED', 'expired'],
    [409, 'TG_LOGIN_ALREADY_CONFIRMED', 'already_confirmed'],
    [409, 'TG_LOGIN_DECLINED', 'declined'],
    [409, 'TG_LOGIN_NOT_OPENED', 'error'],
    [400, 'invalid_phone_number', 'error'],
    [401, 'TG_BOT_SIGNATURE_INVALID', 'error'],
  ];
  for (const [status, location, key] of cases) {
    const f = fixture();
    await f.run();
    f.api.confirm = async () => {
      throw new ProboxLoginError(status, location);
    };
    f.contact();
    await f.run();
    assert.equal(f.auth(), undefined, location);
    assert.equal(f.last().text, i18n.t('uz', `telegram_auth_${key}`));
    assert.deepEqual(f.last().options, { reply_markup: { remove_keyboard: true } });
  }
});

test('network and 5xx confirmation failures preserve pending state for a safe retry', async () => {
  for (const error of [new Error('transport'), new ProboxLoginError(503, 'TG_LOGIN_UNAVAILABLE')]) {
    const f = fixture();
    await f.run();
    const pending = { ...f.auth() };
    f.api.confirm = async () => {
      throw error;
    };
    f.contact();
    await f.run();
    assert.deepEqual(f.auth(), pending);
    assert.equal(f.last().text, i18n.t('uz', 'telegram_auth_retry'));
    f.api.confirm = async () => ({ login_id: loginId, status: 'completed' });
    await f.run();
    assert.equal(f.auth()?.status, 'verified');
  }
});

test('failed open never asks for contact; locally expired or different-sender sessions never confirm', async () => {
  const f = fixture();
  f.api.open = async () => {
    throw new ProboxLoginError(503, 'TG_LOGIN_UNAVAILABLE');
  };
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.ok(!JSON.stringify(f.last().options).includes('request_contact'));
  for (const scenario of ['expired', 'sender']) {
    const g = fixture();
    await g.run();
    if (scenario === 'expired') g.auth()!.expires_at = Date.now();
    else g.auth()!.telegram_id = 456;
    g.contact();
    await g.run();
    assert.equal(g.auth(), undefined);
    assert.equal(g.confirmed.length, 0);
  }
  const g = fixture();
  g.api.open = async () => ({ ...openResult(), expires_at: new Date(1).toISOString() });
  await g.run();
  assert.equal(g.auth(), undefined);
});

test('cancel and not-me decline with correct reasons and remove keyboard', async () => {
  for (const [text, reason] of [
    ['/cancel@example_bot', 'cancelled'],
    [i18n.t('uz', 'telegram_auth_not_me'), 'not_me'],
  ]) {
    const f = fixture();
    await f.run();
    f.text(text);
    await f.run();
    assert.deepEqual(f.declined, [[loginId, 123, reason]]);
    assert.equal(f.auth(), undefined);
    assert.deepEqual(f.last().options, { reply_markup: { remove_keyboard: true } });
  }
});

test('failed decline preserves refusal and retries decline rather than confirming a later contact', async () => {
  const f = fixture();
  await f.run();
  f.api.decline = async () => {
    throw new ProboxLoginError(503, 'TG_LOGIN_UNAVAILABLE');
  };
  f.text('/cancel');
  await f.run();
  const pending = f.auth();
  assert.equal(pending?.status, 'pending');
  assert.equal(pending?.status === 'pending' && pending.decline_reason, 'cancelled');
  f.api.decline = async (id, user, reason) => {
    f.declined.push([id, user, reason]);
    return { login_id: id, status: 'declined' };
  };
  f.contact();
  await f.run();
  assert.equal(f.confirmed.length, 0);
  assert.deepEqual(f.declined, [[loginId, 123, 'cancelled']]);
  assert.equal(f.auth(), undefined);
});

test('new links replace attempts; ordinary starts abandon without decline; phone-only links are rejected', async () => {
  const f = fixture();
  await f.run();
  f.text(`/start auth_${anotherId}`);
  await f.run();
  assert.equal(f.auth()?.login_id, anotherId);
  f.text('/start auth_998901234567');
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.equal(f.opened.length, 2);
  for (const command of ['/start', '/start aksiya_01']) {
    const g = fixture();
    await g.run();
    g.text(command);
    await g.run();
    assert.equal(g.auth(), undefined);
    assert.equal(g.declined.length, 0);
    assert.equal(g.stats().nextCalls, 1);
  }
});

test('rejects old persisted phone-only state and leaves normal group/promo updates alone', async () => {
  const f = fixture();
  f.contact();
  Object.assign(f.ctx.session, {
    telegramAuth: { status: 'pending', phone_number: '+998901234567', telegram_id: 123 },
  });
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.equal(f.confirmed.length, 0);
  const g = fixture();
  Object.assign(g.ctx.chat!, { type: 'group' });
  await g.run();
  assert.equal(g.opened.length, 0);
  g.text('hello');
  await g.run();
  assert.equal(g.stats().nextCalls, 1);
  const h = fixture();
  h.text('/start aksiya_01');
  await h.run();
  assert.equal(h.stats().exits, 0);
});

test('pending callbacks cannot reach other flows; menu start abandons without declining', async () => {
  const f = fixture();
  await f.run();
  f.message(undefined);
  Object.defineProperty(f.ctx, 'callbackQuery', {
    configurable: true,
    value: { data: 'old_menu' },
  });
  await f.run();
  assert.equal(f.stats().callbackAnswers, 1);
  assert.equal(f.stats().nextCalls, 0);
  Object.defineProperty(f.ctx, 'callbackQuery', { configurable: true, value: { data: 'start' } });
  await f.run();
  assert.equal(f.auth(), undefined);
  assert.equal(f.declined.length, 0);
  assert.equal(f.stats().nextCalls, 1);
});

test('real conversation replay is interrupted; session serialization persists auth; later ordinary contacts still work', async () => {
  const f = fixture();
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
  bot.use(
    session({
      initial: () => ({}),
      storage: {
        read: async (key) =>
          data.has(key) ? (JSON.parse(data.get(key)!) as SessionData) : undefined,
        write: async (key, value) => {
          data.set(key, JSON.stringify(value));
        },
        delete: async (key) => {
          data.delete(key);
        },
      },
    }),
  );
  bot.use(i18n);
  bot.use(conversations());
  bot.use(createTelegramAuthMiddleware(async () => {}, f.api));
  let conversationContacts = 0;
  bot.use(
    createConversation(async (conversation) => {
      await conversation.waitFor('message:contact');
      conversationContacts++;
    }, 'ordinary'),
  );
  bot.command('ordinary', (ctx) => ctx.conversation.enter('ordinary'));
  bot.api.config.use(
    async () =>
      ({
        ok: true,
        result: { message_id: 1, date: 1, chat: { id: 123, type: 'private' } },
      }) as never,
  );
  let id = 0;
  async function update(content: object) {
    await bot.handleUpdate({
      update_id: ++id,
      message: {
        message_id: id,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123, type: 'private', first_name: 'Test' },
        from: { id: 123, is_bot: false, first_name: 'Test' },
        entities:
          'text' in content
            ? [
                {
                  type: 'bot_command',
                  offset: 0,
                  length: String(content.text).split(' ')[0].length,
                },
              ]
            : undefined,
        ...content,
      },
    } as Update);
  }
  await update({ text: '/ordinary' });
  await update({ text: `/start auth_${loginId}` });
  assert.equal(JSON.parse(data.get('123')!).telegramAuth.status, 'pending');
  const contact = { contact: { phone_number: '998901234567', user_id: 123, first_name: 'Test' } };
  await update(contact);
  assert.equal(conversationContacts, 0);
  assert.equal(JSON.parse(data.get('123')!).telegramAuth.status, 'verified');
  await update({ text: '/ordinary' });
  await update(contact);
  assert.equal(conversationContacts, 1);
});

test('messages and refusal buttons work in both supported locales', async () => {
  for (const locale of ['uz', 'ru']) {
    const f = fixture(locale);
    await f.run();
    f.text(i18n.t(locale, 'telegram_auth_not_me'));
    await f.run();
    assert.deepEqual(f.declined, [[loginId, 123, 'not_me']]);
    for (const key of [
      'request_contact',
      'own_contact_only',
      'phone_mismatch',
      'invalid_link',
      'private_only',
      'expired',
      'cancelled',
      'verified',
      'heading',
      'share_phone',
      'not_me',
      'retry',
      'open_retry',
      'decline_retry',
      'error',
      'other_account',
      'already_confirmed',
      'declined',
    ]) {
      const fullKey = `telegram_auth_${key}`;
      assert.notEqual(i18n.t(locale, fullKey), fullKey);
    }
  }
});
