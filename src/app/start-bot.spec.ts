import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBotPolling } from './start-bot';

test(
  'launchBotPolling resolves after the bot initialization callback without waiting for polling to stop',
  { concurrency: false },
  async () => {
    let started = false;

    const result = await Promise.race([
      launchBotPolling(
        ({
          start: async (options?: { onStart?: (botInfo: { username: string }) => void }) => {
            started = true;
            options?.onStart?.({ username: 'probox_test_bot' });
            await new Promise(() => undefined);
          },
        } as never),
        () => undefined,
      ).then(() => 'resolved'),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('timeout'), 100);
      }),
    ]);

    assert.equal(started, true);
    assert.equal(result, 'resolved');
  },
);

test(
  'launchBotPolling rejects when bot startup fails before initialization completes',
  { concurrency: false },
  async () => {
    await assert.rejects(
      launchBotPolling(
        ({
          start: async () => {
            throw new Error('startup failed');
          },
        } as never),
        () => undefined,
      ),
      /startup failed/,
    );
  },
);
