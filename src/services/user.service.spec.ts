import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getUserIdentityResetData,
  isUserIdentitySwitch,
  normalizeUserPhoneForIdentity,
} from './user.service';

test('normalizeUserPhoneForIdentity keeps Uzbekistan phone numbers comparable', () => {
  assert.equal(normalizeUserPhoneForIdentity('+998 90 123 45 67'), '+998901234567');
  assert.equal(normalizeUserPhoneForIdentity('90-123-45-67'), '+998901234567');
  assert.equal(normalizeUserPhoneForIdentity(undefined), null);
});

test('isUserIdentitySwitch only flags a real account switch when the phone changes', () => {
  assert.equal(isUserIdentitySwitch('+998901234567', '90 123 45 67'), false);
  assert.equal(isUserIdentitySwitch('+998901234567', '+998909999999'), true);
  assert.equal(isUserIdentitySwitch(null, '+998909999999'), false);
});

test('getUserIdentityResetData clears identity-bound fields on account switch', () => {
  assert.deepEqual(getUserIdentityResetData(), {
    jshshir: null,
    passport_series: null,
    address: null,
  });
});
