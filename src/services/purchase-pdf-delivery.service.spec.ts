import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.BOT_ENABLED = 'false';
process.env.API_ENABLED = 'true';
process.env.API_KEY = 'test-api-key';
process.env.API_HOST = '127.0.0.1';

import { PurchasePdfDeliveryService } from './purchase-pdf-delivery.service';
import { User, UserService } from './user.service';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 21,
  telegram_id: 998001,
  first_name: 'Old',
  last_name: 'Name',
  phone_number: '+998901234567',
  sap_card_code: null,
  jshshir: null,
  passport_series: null,
  address: null,
  language_code: 'uz',
  is_admin: false,
  is_support_banned: false,
  is_logged_out: false,
  is_blocked: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

test('PurchasePdfDeliveryService falls back to phone_number, syncs SAP data, then sends the PDF', async () => {
  const serviceInternals = PurchasePdfDeliveryService as unknown as Record<string, unknown>;

  const originalGetUserByJshshir = UserService.getUserByJshshir;
  const originalGetUserBySapCardCode = UserService.getUserBySapCardCode;
  const originalGetUserByPhoneNumber = UserService.getUserByPhoneNumber;
  const originalUpdateUser = UserService.updateUser;
  const originalDownloadPdf = serviceInternals.downloadPdf;
  const originalSendPdfToUser = serviceInternals.sendPdfToUser;
  const originalSendPdfToAdminGroup = serviceInternals.sendPdfToAdminGroup;
  const originalSapService = serviceInternals.sapService;

  const calls: string[] = [];
  const staleUser = makeUser();
  let updatePayload: Partial<User> | undefined;
  let sentUser: User | undefined;

  UserService.getUserByJshshir = async () => {
    calls.push('jshshir');
    return null;
  };
  UserService.getUserBySapCardCode = async () => {
    calls.push('cardCode');
    return null;
  };
  UserService.getUserByPhoneNumber = async (phoneNumber: string) => {
    calls.push(`phone:${phoneNumber}`);
    return staleUser;
  };
  UserService.updateUser = async (id: number, userData: Partial<User>) => {
    calls.push('updateUser');
    assert.equal(id, staleUser.id);
    updatePayload = userData;
    return {
      ...staleUser,
      ...userData,
    };
  };
  serviceInternals.sapService = {
    getBusinessPartnerByPhone: async (phoneNumber: string) => {
      calls.push(`sap:${phoneNumber}`);
      return [
        {
          CardCode: 'BP777',
          CardName: 'Ali Valiyev',
          CardType: 'C',
          Phone1: phoneNumber,
          U_admin: 'yes',
        },
      ];
    },
  };
  serviceInternals.downloadPdf = async () => Buffer.from('pdf');
  serviceInternals.sendPdfToUser = async (user: User) => {
    calls.push('sendUser');
    sentUser = user;
    return { delivered: true };
  };
  serviceInternals.sendPdfToAdminGroup = async () => {
    calls.push('sendAdmin');
    return { delivered: true };
  };

  try {
    const result = await PurchasePdfDeliveryService.process({
      jshshir: '12345678901234',
      cardCode: 'C001',
      phoneNumber: '+998901234567',
      pdfUrl: 'https://example.com/purchase.pdf',
    });

    assert.deepEqual(calls, [
      'jshshir',
      'cardCode',
      'phone:+998901234567',
      'sap:+998901234567',
      'updateUser',
      'sendUser',
      'sendAdmin',
    ]);
    assert.equal(result.matchedBy, 'phone_number');
    assert.equal(result.userFound, true);
    assert.equal(result.userDelivered, true);
    assert.equal(result.adminGroupDelivered, true);
    assert.equal(result.identifiers.phoneNumber, '+998901234567');
    assert.equal(result.user?.sapCardCode, 'BP777');
    assert.equal(result.user?.firstName, 'Ali');
    assert.equal(result.user?.lastName, 'Valiyev');
    assert.equal(result.user?.telegramId, staleUser.telegram_id);

    assert.equal(updatePayload?.sap_card_code, 'BP777');
    assert.equal(updatePayload?.is_admin, true);
    assert.equal(updatePayload?.first_name, 'Ali');
    assert.equal(updatePayload?.last_name, 'Valiyev');
    assert.equal(sentUser?.sap_card_code, 'BP777');
  } finally {
    UserService.getUserByJshshir = originalGetUserByJshshir;
    UserService.getUserBySapCardCode = originalGetUserBySapCardCode;
    UserService.getUserByPhoneNumber = originalGetUserByPhoneNumber;
    UserService.updateUser = originalUpdateUser;
    serviceInternals.downloadPdf = originalDownloadPdf;
    serviceInternals.sendPdfToUser = originalSendPdfToUser;
    serviceInternals.sendPdfToAdminGroup = originalSendPdfToAdminGroup;
    serviceInternals.sapService = originalSapService;
  }
});
