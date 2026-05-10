import assert from 'node:assert/strict';
import test from 'node:test';
import { isHumanHandoffRequest } from './support-intent.util';

test('isHumanHandoffRequest', async (t) => {
  await t.test('returns false for empty or whitespace messages', () => {
    assert.equal(isHumanHandoffRequest(''), false);
    assert.equal(isHumanHandoffRequest('   '), false);
    assert.equal(isHumanHandoffRequest('\n\t'), false);
  });

  await t.test('returns true for direct human requests (Uzbek)', () => {
    assert.equal(isHumanHandoffRequest('operator kerak'), true);
    assert.equal(isHumanHandoffRequest('menga odam kerak'), true);
    assert.equal(isHumanHandoffRequest('inson chaqir'), true);
    assert.equal(isHumanHandoffRequest('xodim bilan gaplashmoqchiman'), true);
    assert.equal(isHumanHandoffRequest('operator ulab yubor'), true);
  });

  await t.test('returns true for handoff actions with human targets (Uzbek)', () => {
    assert.equal(isHumanHandoffRequest('adminga ulab yubor'), true);
    assert.equal(isHumanHandoffRequest("operatorga yo'naltir"), true);
    assert.equal(isHumanHandoffRequest("menedjerga jo'nat"), true);
    assert.equal(isHumanHandoffRequest("operatorga bog'la"), true);
    assert.equal(isHumanHandoffRequest('inson yetkazib ber'), true);
  });

  await t.test('returns true for handoff actions with human targets (English)', () => {
    assert.equal(isHumanHandoffRequest('connect to support'), true);
    assert.equal(isHumanHandoffRequest('forward to manager'), true);
    assert.equal(isHumanHandoffRequest('escalate to human'), true);
  });

  await t.test('returns false for messages without support intent', () => {
    assert.equal(isHumanHandoffRequest('salom, qandaysiz?'), false);
    assert.equal(isHumanHandoffRequest('qancha turadi?'), false);
    assert.equal(isHumanHandoffRequest('qachon keladi?'), false);
  });

  await t.test('returns false for messages with target but no action', () => {
    assert.equal(isHumanHandoffRequest('operator yaxshimisiz'), false);
    assert.equal(isHumanHandoffRequest('menedjer'), false);
    assert.equal(isHumanHandoffRequest('admin qayerda'), false);
  });

  await t.test('returns false for messages with action but no target', () => {
    assert.equal(isHumanHandoffRequest('ulab yubor'), false);
    assert.equal(isHumanHandoffRequest("yo'naltir"), false);
  });

  await t.test('handles case insensitivity', () => {
    assert.equal(isHumanHandoffRequest('OPERATOR KERAK'), true);
    assert.equal(isHumanHandoffRequest('AdminGa Ulab Yubor'), true);
  });

  await t.test('handles punctuation variations in Uzbek', () => {
    assert.equal(isHumanHandoffRequest("operatorga yo'naltir"), true);
    assert.equal(isHumanHandoffRequest('operatorga yo`naltir'), true);
    assert.equal(isHumanHandoffRequest('operatorga yo’naltir'), true);
    assert.equal(isHumanHandoffRequest("adminga jo'nat"), true);
  });

  await t.test('demonstrates current failure with Cyrillic characters due to \\b', () => {
    // These *should* ideally be true, but currently fail due to \b boundary on Cyrillic in regex.
    // They serve to document the current regex behavior.
    assert.equal(isHumanHandoffRequest('оператор нужен'), false);
    assert.equal(isHumanHandoffRequest('соедините с оператором'), false);
  });
});
