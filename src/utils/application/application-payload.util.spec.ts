import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildApplicationPayload,
  getMissingApplicationPayloadFields,
  isApplicationRegistrationComplete,
} from './application-payload.util';

const baseUser = {
  first_name: 'Ali',
  last_name: 'Valiyev',
  phone_number: '+998 90 123 45 67',
  jshshir: '12345678901234',
  passport_series: 'ab1234567',
  address: 'Tashkent',
};

test('buildApplicationPayload normalizes fields sent to CRM', () => {
  assert.deepEqual(buildApplicationPayload(baseUser), {
    clientName: 'Ali Valiyev',
    clientPhone: '+998901234567',
    jshshir: '12345678901234',
    passportId: 'AB1234567',
    address: 'Tashkent',
  });
});

test('getMissingApplicationPayloadFields rejects incomplete application data', () => {
  const payload = buildApplicationPayload({
    ...baseUser,
    phone_number: null,
    jshshir: '123',
    address: '',
  });

  assert.deepEqual(getMissingApplicationPayloadFields(payload), [
    'clientPhone',
    'jshshir',
    'address',
  ]);
});

test('isApplicationRegistrationComplete requires a real phone number', () => {
  assert.equal(isApplicationRegistrationComplete(baseUser), true);
  assert.equal(isApplicationRegistrationComplete({ ...baseUser, phone_number: null }), false);
});
