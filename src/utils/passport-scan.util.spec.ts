import test from 'node:test';
import assert from 'node:assert/strict';
import { findBestPassportScan } from './passport-scan.util';
import { PassportImageVariant } from './passport-image.util';

const variants: PassportImageVariant[] = [0, 90, 180, 270].map((angle) => ({
  angle,
  buffer: Buffer.from([angle]),
  width: angle === 90 || angle === 270 ? 600 : 1000,
  height: angle === 90 || angle === 270 ? 1000 : 600,
}));

test('findBestPassportScan stops on the first credible QR result', async () => {
  const outcome = await findBestPassportScan(variants, [
    {
      source: 'qr',
      scan: async (variant) => ({
        cardNumber: variant.angle === 180 ? 'AA1234567' : null,
        jshshir: null,
        firstName: null,
        lastName: null,
      }),
    },
    {
      source: 'ocr',
      scan: async () => ({
        cardNumber: null,
        jshshir: null,
        firstName: null,
        lastName: null,
      }),
    },
  ]);

  assert.equal(outcome.source, 'qr');
  assert.equal(outcome.angle, 180);
  assert.equal(outcome.attempts, 3);
  assert.equal(outcome.cardNumber, 'AA1234567');
});

test('findBestPassportScan falls back to OCR after all QR rotations fail', async () => {
  const outcome = await findBestPassportScan(variants, [
    {
      source: 'qr',
      scan: async () => ({
        cardNumber: null,
        jshshir: null,
        firstName: null,
        lastName: null,
      }),
    },
    {
      source: 'ocr',
      scan: async (variant) => ({
        cardNumber: null,
        jshshir: variant.angle === 270 ? '32165498701234' : null,
        firstName: null,
        lastName: null,
      }),
    },
  ]);

  assert.equal(outcome.source, 'ocr');
  assert.equal(outcome.angle, 270);
  assert.equal(outcome.attempts, 8);
  assert.equal(outcome.jshshir, '32165498701234');
});

test('findBestPassportScan keeps retrying after partial invalid OCR results', async () => {
  const outcome = await findBestPassportScan(variants, [
    {
      source: 'qr',
      scan: async (variant) => ({
        cardNumber: variant.angle === 0 ? 'A1' : null,
        jshshir: null,
        firstName: variant.angle === 0 ? 'Ali' : null,
        lastName: null,
      }),
    },
    {
      source: 'ocr',
      scan: async (variant) => ({
        cardNumber: null,
        jshshir: variant.angle === 270 ? '12345' : null,
        firstName: null,
        lastName: variant.angle === 270 ? 'Test' : null,
      }),
    },
  ]);

  assert.equal(outcome.isCredible, false);
  assert.equal(outcome.attempts, 8);
  assert.equal(outcome.source, 'qr');
  assert.equal(outcome.angle, 0);
  assert.equal(outcome.score, 2);
});
