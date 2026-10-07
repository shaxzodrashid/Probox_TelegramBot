import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { ProboxLoginClient, ProboxLoginError } from './probox-login.service';

const loginId = '3f6c0a3b9d2e4f718a5b6c7d8e9f0a1b';
const secret = 'synthetic-test-secret';
const open = {
  login_id: loginId,
  status: 'opened',
  phone_masked: '+998 90 *** ** 67',
  language: 'uz',
  client: { device_type: null, os: null, browser: null },
  location: { country_code: null, country: null, city: null },
  requested_at: '2026-10-07T10:00:00.000Z',
  expires_at: '2026-10-07T10:05:00.000Z',
  expires_in: 300,
};
const response = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function clientWith(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const delays: number[] = [];
  let now = 1_791_360_000_000;
  const client = new ProboxLoginClient({
    baseUrl: 'https://store-api.example/',
    secret,
    now: () => now,
    sleep: async (ms) => {
      delays.push(ms);
      now += 1000;
    },
    fetch: (async (url, init) => {
      calls.push({ url: String(url), init: init! });
      const next = responses.shift();
      assert.ok(next, 'unexpected HTTP request');
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
  });
  return { client, calls, delays };
}

test('sends exact open/confirm/decline bodies and signatures, omits undefined audit fields', async () => {
  const f = clientWith([
    response(200, open),
    response(200, { login_id: loginId, status: 'completed' }),
    response(200, { login_id: loginId, status: 'declined' }),
  ]);
  assert.deepEqual(await f.client.open(loginId, 123), open);
  await f.client.confirm({
    login_id: loginId,
    telegram_user_id: 123,
    phone_number: '+998 (90) 123-45-67',
    first_name: 'Ali',
  });
  await f.client.decline(loginId, 123, 'not_me');
  const bodies = [
    { login_id: loginId, telegram_user_id: 123 },
    {
      login_id: loginId,
      telegram_user_id: 123,
      phone_number: '+998 (90) 123-45-67',
      first_name: 'Ali',
    },
    { login_id: loginId, telegram_user_id: 123, reason: 'not_me' },
  ];
  for (let i = 0; i < f.calls.length; i++) {
    const { url, init } = f.calls[i];
    assert.equal(
      url,
      `https://store-api.example/api/v1/webhooks/telegram-bot/login/${['open', 'confirm', 'decline'][i]}`,
    );
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    assert.equal(init.body, JSON.stringify(bodies[i]));
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['Content-Type'], 'application/json');
    const ts = '1791360000';
    assert.equal(
      headers['X-Probox-Bot-Signature'],
      `t=${ts},s=${createHmac('sha256', secret).update(`${ts}.${init.body}`).digest('hex')}`,
    );
  }
});

test('retries network and 5xx failures, with identical body and fresh timestamp/signature', async () => {
  const f = clientWith([
    new Error('socket closed'),
    response(503, { location: 'TG_LOGIN_UNAVAILABLE' }),
    response(200, { login_id: loginId, status: 'confirmed' }),
  ]);
  await f.client.confirm({
    login_id: loginId,
    telegram_user_id: 123,
    phone_number: '998901234567',
  });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.delays, [500, 1000]);
  assert.equal(new Set(f.calls.map(({ init }) => init.body)).size, 1);
  const signatures = f.calls.map(
    ({ init }) => (init.headers as Record<string, string>)['X-Probox-Bot-Signature'],
  );
  assert.equal(new Set(signatures).size, 3);
  for (const { init } of f.calls) {
    const header = (init.headers as Record<string, string>)['X-Probox-Bot-Signature'];
    const ts = header.split(',')[0].slice(2);
    assert.equal(
      header,
      `t=${ts},s=${createHmac('sha256', secret).update(`${ts}.${init.body}`).digest('hex')}`,
    );
  }
});

test('4xx is terminal and never retried; upstream messages and transport details are discarded', async () => {
  for (const status of [400, 401, 403, 404, 409, 410, 429]) {
    const f = clientWith([
      response(status, {
        location: 'TG_LOGIN_PHONE_MISMATCH',
        message: `${secret} ${loginId} +998901234567`,
      }),
    ]);
    await assert.rejects(
      () => f.client.open(loginId, 123),
      (error: unknown) => {
        assert.ok(error instanceof ProboxLoginError);
        assert.equal(error.status, status);
        assert.equal(error.location, 'TG_LOGIN_PHONE_MISMATCH');
        assert.equal(error.retryable, false);
        assert.ok(!error.message.includes(secret));
        assert.ok(!error.message.includes(loginId));
        return true;
      },
    );
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.delays, []);
  }
});

test('retry exhaustion remains retryable and does not retain network errors', async () => {
  for (const failure of [
    new Error(`request ${secret}`),
    response(503, { location: 'TG_LOGIN_UNAVAILABLE' }),
  ]) {
    const responses =
      failure instanceof Error
        ? [failure, failure, failure]
        : [failure, failure.clone(), failure.clone()];
    const f = clientWith(responses);
    await assert.rejects(
      () => f.client.open(loginId, 123),
      (error: unknown) => {
        assert.ok(error instanceof ProboxLoginError);
        assert.equal(error.retryable, true);
        assert.ok(!JSON.stringify(error).includes(secret));
        return true;
      },
    );
    assert.equal(f.calls.length, 3);
    assert.deepEqual(f.delays, [500, 1000]);
  }
});

test('fails closed on incomplete, wrong-session or wrong-status success responses', async () => {
  for (const value of [
    {},
    { ...open, login_id: 'wrong' },
    { ...open, expires_at: 'invalid' },
    { ...open, client: null },
  ]) {
    const f = clientWith([response(200, value)]);
    await assert.rejects(
      () => f.client.open(loginId, 123),
      (error: unknown) =>
        error instanceof ProboxLoginError && error.location === 'TG_BOT_INVALID_RESPONSE',
    );
  }
  for (const value of [
    { login_id: loginId, status: 'opened' },
    { login_id: 'wrong', status: 'confirmed' },
  ]) {
    const f = clientWith([response(200, value)]);
    await assert.rejects(() =>
      f.client.confirm({ login_id: loginId, telegram_user_id: 123, phone_number: '998901234567' }),
    );
  }
  const f = clientWith([response(200, { login_id: loginId, status: 'confirmed' })]);
  await assert.rejects(() => f.client.decline(loginId, 123, 'cancelled'));
});

test('missing secret, invalid origins and non-HTTPS destinations fail before any request', async () => {
  for (const [baseUrl, key] of [
    ['https://store-api.example', ''],
    ['', secret],
    ['http://store-api.example', secret],
    ['https://user:pass@store-api.example', secret],
    ['https://store-api.example/api/v1', secret],
    ['https://store-api.example?key=secret', secret],
  ]) {
    let requests = 0;
    const client = new ProboxLoginClient({
      baseUrl,
      secret: key,
      fetch: (async () => {
        requests++;
        throw new Error();
      }) as typeof fetch,
    });
    await assert.rejects(
      () => client.open(loginId, 123),
      (error: unknown) =>
        error instanceof ProboxLoginError && error.location === 'TG_BOT_NOT_CONFIGURED',
    );
    assert.equal(requests, 0);
  }
});
