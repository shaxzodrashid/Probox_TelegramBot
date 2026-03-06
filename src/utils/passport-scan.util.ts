import { OCRResult, OCRService, PassportDataFields } from '../services/ocr.service';
import { logger } from './logger';
import { PassportImageVariant } from './passport-image.util';

export type PassportScanSource = 'qr' | 'ocr';

export interface PassportScanOutcome extends PassportDataFields {
  score: number;
  isCredible: boolean;
  source: PassportScanSource | null;
  angle: number | null;
  attempts: number;
}

interface PassportScanner {
  source: PassportScanSource;
  scan: (variant: PassportImageVariant) => Promise<PassportDataFields | OCRResult>;
}

function toOutcome(
  result: PassportDataFields | OCRResult,
  source: PassportScanSource,
  angle: number,
  attempts: number,
): PassportScanOutcome {
  const assessment = OCRService.assessPassportData(result);

  return {
    ...assessment,
    source,
    angle,
    attempts,
  };
}

export async function findBestPassportScan(
  variants: PassportImageVariant[],
  scanners: PassportScanner[],
): Promise<PassportScanOutcome> {
  let attempts = 0;
  let bestOutcome: PassportScanOutcome = {
    cardNumber: null,
    jshshir: null,
    firstName: null,
    lastName: null,
    score: 0,
    isCredible: false,
    source: null,
    angle: null,
    attempts: 0,
  };

  for (const scanner of scanners) {
    for (const variant of variants) {
      attempts += 1;
      const outcome = toOutcome(
        await scanner.scan(variant),
        scanner.source,
        variant.angle,
        attempts,
      );

      logger.debug(
        `[Passport] ${scanner.source.toUpperCase()} attempt angle=${variant.angle} score=${outcome.score} credible=${outcome.isCredible}`,
      );

      if (outcome.score > bestOutcome.score) {
        bestOutcome = outcome;
      }

      if (outcome.isCredible) {
        return outcome;
      }
    }
  }

  return {
    ...bestOutcome,
    attempts,
  };
}
