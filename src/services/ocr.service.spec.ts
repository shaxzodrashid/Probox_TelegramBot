import test from 'node:test';
import assert from 'node:assert/strict';
import { OCRService } from './ocr.service';

test('extractPassportDataFromText accepts valid passport fields', () => {
  const text = [
    'Passport',
    'AA1234567',
    'PINFL 32165498701234',
    'SURNAME',
    'RASHIDOV',
    'GIVEN NAMES',
    'SHAXZOD',
  ].join('\n');

  const result = OCRService.extractPassportDataFromText(text);

  assert.equal(result.cardNumber, 'AA1234567');
  assert.equal(result.jshshir, '32165498701234');
  assert.equal(result.lastName, 'Rashidov');
  assert.equal(result.firstName, 'Shaxzod');
  assert.equal(result.isCredible, true);
  assert.ok(result.score >= 6);
});

test('assessPassportData marks valid jshshir as credible', () => {
  const result = OCRService.assessPassportData({
    cardNumber: null,
    jshshir: '32165498701234',
    firstName: null,
    lastName: null,
  });

  assert.equal(result.isCredible, true);
  assert.ok(result.score >= 3);
});

test('assessPassportData does not treat partial invalid OCR as credible', () => {
  const result = OCRService.assessPassportData({
    cardNumber: 'A123',
    jshshir: '12345',
    firstName: 'Test',
    lastName: null,
  });

  assert.equal(result.isCredible, false);
  assert.equal(result.score, 3);
});

test('extractPassportDataFromText rejects names longer than 20 characters', () => {
  const text = [
    'Passport',
    'AA1234567',
    'PINFL 32165498701234',
    'SURNAME',
    'VERYLONGNAMEWAYBEYOND20CHARACTERS',
    'GIVEN NAMES',
    'ANOTHERVERYLONGNAMEWAYBEYOND20CHARACTERS',
  ].join('\n');

  const result = OCRService.extractPassportDataFromText(text);

  assert.equal(result.firstName, null);
  assert.equal(result.lastName, null);
});
