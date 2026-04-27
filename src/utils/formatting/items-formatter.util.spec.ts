import assert from 'node:assert/strict';
import test from 'node:test';
import { formatItemsList } from './items-formatter.util';

test('formatItemsList strips SAP item code and price', () => {
  assert.equal(
    formatItemsList('APPLE2528::SAMSUNG S25 ULTRA 256GB BLACK NANO SIM::11372571.600000'),
    'SAMSUNG S25 ULTRA 256GB BLACK NANO SIM',
  );
});

test('formatItemsList handles SAP separators with spaces', () => {
  assert.equal(
    formatItemsList('APPLE2528: :SAMSUNG S25 ULTRA 256GB BLACK NANO SIM: :11372571.600000'),
    'SAMSUNG S25 ULTRA 256GB BLACK NANO SIM',
  );
});

test('formatItemsList returns the most expensive product from a multi-item purchase', () => {
  assert.equal(
    formatItemsList(
      'APPLE1883::USB iPhone 15 uchun::0.000000||APPLE2016::iphone 16 pro max 256gb desert::1640.060000',
    ),
    'iphone 16 pro max 256gb desert',
  );
});

test('formatItemsList supports old code-name pairs without prices', () => {
  assert.equal(formatItemsList('OLD1::Old item'), 'Old item');
});
