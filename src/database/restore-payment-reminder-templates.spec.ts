import assert from 'node:assert/strict';
import test from 'node:test';
import type { Knex } from 'knex';
import {
  up,
  down,
  PAYMENT_REMINDER_DEFAULTS,
} from './migrations/20260928090000_restore_payment_reminder_templates';

test('restores only missing active ordinary templates, preserves custom content, and can run twice', async () => {
  const rows: Array<Record<string, unknown>> = [
    {
      template_type: 'payment_reminder_d1',
      channel: 'telegram_bot',
      is_active: true,
      content_uz: 'Custom text',
    },
  ];
  const fakeKnex = ((table: string) => {
    assert.equal(table, 'message_templates');
    return {
      where: (filter: Record<string, unknown>) => ({
        first: async () =>
          rows.find((row) => Object.entries(filter).every(([key, value]) => row[key] === value)),
      }),
      insert: (row: Record<string, unknown>) => ({
        onConflict: () => ({
          ignore: async () => {
            rows.push(row);
          },
        }),
      }),
    };
  }) as unknown as Knex;
  await up(fakeKnex);
  await up(fakeKnex);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].content_uz, 'Custom text');
  assert.deepEqual(
    rows.map((row) => row.template_type).sort(),
    PAYMENT_REMINDER_DEFAULTS.map((row) => row.type).sort(),
  );
  for (const row of rows) assert.ok(!JSON.stringify(row).includes('coupon_code'));
  await down();
  assert.equal(rows.length, 5);
});
