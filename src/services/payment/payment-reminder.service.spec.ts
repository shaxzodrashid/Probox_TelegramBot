import { MessageTemplateService } from '../message-template.service';
import assert from 'node:assert/strict';
import test, { after, type TestContext } from 'node:test';
import {
  PaymentReminderService,
  PaymentReminderRunAlreadyInProgressError,
} from './payment-reminder.service';
import { CouponService } from '../coupon/coupon.service';
import { PromotionService } from '../coupon/promotion.service';
import { UserService, type User } from '../user.service';
import { BotNotificationService } from '../bot-notification.service';
import { redisService } from '../../redis/redis.service';
import db from '../../database/database';
redisService.getClient().disconnect();
after(async () => {
  await db.destroy();
});

const internals = PaymentReminderService as unknown as {
  loadReminderState: () => Promise<{
    sentRemindersSet: Set<string>;
    deliveredMessagesSet: Set<string>;
  }>;
  acquireRunLock: () => Promise<string>;
  releaseRunLock: (token: string) => Promise<void>;
  fetchInstallments: (window: { dueDateFrom: string; dueDateTo: string }) => Promise<unknown[]>;
  hasReminderBeenSent: () => Promise<boolean>;
  logReminder: (log: { status: string }) => Promise<void>;
  notifyAdminsAboutMissingTemplates: (types: Set<string>) => Promise<void>;
};
const now = new Date('2026-09-28T08:01:00Z');
const installment = (id: number, due: string, paid = 0, paidDate?: string, cardCode = 'C1') => ({
  DocEntry: id,
  InstlmntID: 1,
  CardCode: cardCode,
  CardName: 'Test',
  InstDueDate: due,
  InstTotal: 100,
  InstPaidToDate: paid,
  InstFullyPaidDate: paidDate,
  itemsPairs: '',
});
function setup(t: TestContext) {
  t.mock.method(MessageTemplateService, 'listTemplates', async () => []);
  t.mock.method(internals, 'loadReminderState', async () => ({
    sentRemindersSet: new Set<string>(),
    deliveredMessagesSet: new Set<string>(),
  }));
  const sent: string[] = [];
  const warnings: string[] = [];
  const logs: string[] = [];
  const released: string[] = [];
  t.mock.method(internals, 'acquireRunLock', async () => 'test-lock');
  t.mock.method(internals, 'releaseRunLock', async (token: string) => {
    released.push(token);
  });
  t.mock.method(internals, 'hasReminderBeenSent', async () => false);
  t.mock.method(internals, 'logReminder', async (log: { status: string }) => {
    logs.push(log.status);
  });
  t.mock.method(internals, 'notifyAdminsAboutMissingTemplates', async (types: Set<string>) => {
    warnings.push(...types);
  });
  t.mock.method(UserService, 'getUsersWithSapCardCode', async () => [
    {
      id: 1,
      telegram_id: 123,
      sap_card_code: 'C1',
      language_code: 'uz',
      first_name: 'Test',
    } as User,
  ]);
  for (const method of ['createCouponsForUser', 'expireStaleCoupons'] as const)
    t.mock.method(CouponService, method, () => {
      throw new Error('coupon data must not be touched');
    });
  t.mock.method(PromotionService, 'getCurrentPromotion', () => {
    throw new Error('promotions must not be loaded');
  });
  t.mock.method(
    BotNotificationService,
    'sendTemplateMessage',
    async (params: { templateType: string }) => {
      sent.push(params.templateType);
      return { delivered: true };
    },
  );
  return { sent, warnings, logs, released };
}

test('payment run sends all five ordinary reminder types and skips linked/unlinked on-time rewards', async (t) => {
  const state = setup(t);
  t.mock.method(
    internals,
    'fetchInstallments',
    async (window: { dueDateFrom: string; dueDateTo: string }) => {
      assert.equal(window.dueDateFrom, '2026-09-01');
      assert.equal(window.dueDateTo, '2026-09-30');
      return [
        installment(1, '2026-09-30'),
        installment(2, '2026-09-29'),
        installment(3, '2026-09-28'),
        installment(4, '2026-09-27'),
        installment(5, '2026-09-20', 100, '2026-09-21'),
        installment(6, '2026-09-28', 100, '2026-09-28'),
        installment(7, '2026-09-28', 100, '2026-09-27', 'UNLINKED'),
      ];
    },
  );
  const result = await PaymentReminderService.run({ now });
  assert.deepEqual(state.sent, [
    'payment_reminder_d2',
    'payment_reminder_d1',
    'payment_reminder_d0',
    'payment_overdue',
    'payment_paid_late',
  ]);
  assert.equal(result.remindersSent, 5);
  assert.equal(
    result.rewardCouponsIssued +
      result.rewardNotificationsSent +
      result.unlinkedRewardCouponsIssued,
    0,
  );
  assert.deepEqual(state.warnings, []);
  assert.deepEqual(state.released, ['test-lock']);
});

test('missing templates warn only for ordinary payment messages', async (t) => {
  const state = setup(t);
  t.mock.method(internals, 'fetchInstallments', async () => [
    installment(1, '2026-09-28'),
    installment(2, '2026-09-28', 100, '2026-09-28'),
  ]);
  t.mock.method(BotNotificationService, 'sendTemplateMessage', async () => ({
    delivered: false,
    error: 'Template not found for type payment_reminder_d0',
  }));
  await PaymentReminderService.run({ now });
  assert.deepEqual(state.warnings, ['payment_reminder_d0']);
  assert.deepEqual(state.logs, ['failed']);
});

test('dry run and already processed installments do not send or write', async (t) => {
  const state = setup(t);
  t.mock.method(internals, 'fetchInstallments', async () => [installment(1, '2026-09-28')]);
  assert.equal((await PaymentReminderService.run({ now, dryRun: true })).remindersSent, 1);
  t.mock.method(internals, 'loadReminderState', async () => ({
    sentRemindersSet: new Set(['1:1:1:d0']),
    deliveredMessagesSet: new Set<string>(),
  }));
  assert.equal((await PaymentReminderService.run({ now })).remindersSent, 0);
  assert.deepEqual(state.sent, []);
  assert.deepEqual(state.logs, []);
});

test('run releases its lock on failures and refuses concurrent execution', async (t) => {
  const state = setup(t);
  t.mock.method(internals, 'fetchInstallments', async () => {
    throw new Error('SAP unavailable');
  });
  await assert.rejects(PaymentReminderService.run({ now }), /SAP unavailable/);
  assert.deepEqual(state.released, ['test-lock']);
  t.mock.method(internals, 'acquireRunLock', async () => {
    throw new PaymentReminderRunAlreadyInProgressError();
  });
  await assert.rejects(
    PaymentReminderService.run({ now }),
    PaymentReminderRunAlreadyInProgressError,
  );
  assert.equal(state.released.length, 1);
});
