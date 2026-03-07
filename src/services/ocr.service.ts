import Ocr from '@gutenye/ocr-node';
import { logger } from '../utils/logger';

export interface PassportDataFields {
  cardNumber: string | null;
  jshshir: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface OCRResult extends PassportDataFields {
  text: string;
  score: number;
  isCredible: boolean;
}

export class OCRService {
  private static ocrInstance: any = null;

  static async getOcrInstance() {
    if (!this.ocrInstance) {
      this.ocrInstance = await Ocr.create();
    }
    return this.ocrInstance;
  }

  static async recognizeText(imageBuffer: Buffer): Promise<string> {
    try {
      const ocr = await this.getOcrInstance();
      const lines = await ocr.detect(imageBuffer as any);
      return lines.map((l: any) => l.text).join('\n');
    } catch (error) {
      logger.error('OCR recognition error:', error);
      throw error;
    }
  }

  static async extractPassportData(imageBuffer: Buffer): Promise<OCRResult> {
    logger.debug('[OCR] Starting text recognition...');
    const text = await this.recognizeText(imageBuffer);
    logger.debug('[OCR] Recognition result:', text);

    return this.extractPassportDataFromText(text);
  }

  static extractPassportDataFromText(text: string): OCRResult {
    let jshshir: string | null = null;
    let cardNumber: string | null = null;

    const lines = text
      .split('\n')
      .map((l) => l.replace(/\s+/g, ''))
      .filter((l) => l.length > 0);

    for (const line of lines) {
      if (line.length < 42 || line.length > 48) {
        continue;
      }

      const extractedCardNum = line.slice(0, 9).replace(/</g, '').toUpperCase();
      const lastLetterMatch = [...line.matchAll(/[A-Z]/gi)].pop();

      if (!lastLetterMatch || lastLetterMatch.index === undefined) {
        continue;
      }

      const rawJshshir = line.slice(lastLetterMatch.index + 8, lastLetterMatch.index + 22);
      const cleanedJshshir = rawJshshir
        .replace(/O|o/g, '0')
        .replace(/I|i|l/g, '1')
        .replace(/S|s/g, '5');

      if (/^[A-Z0-9]{7,9}$/i.test(extractedCardNum) && /^\d{14}$/.test(cleanedJshshir)) {
        cardNumber = extractedCardNum;
        jshshir = cleanedJshshir;
        break;
      }
    }

    const names = this.extractNames(text);
    const result: PassportDataFields = {
      jshshir: jshshir || this.extractJShShIR(text),
      cardNumber: cardNumber || this.extractCardNumber(text),
      firstName: names.firstName,
      lastName: names.lastName,
    };

    return {
      ...this.assessPassportData(result),
      text,
    };
  }

  static assessPassportData(
    fields: PassportDataFields,
  ): PassportDataFields & { score: number; isCredible: boolean } {
    const normalized: PassportDataFields = {
      cardNumber: fields.cardNumber ? fields.cardNumber.toUpperCase() : null,
      jshshir: fields.jshshir ? fields.jshshir.replace(/\D/g, '') : null,
      firstName: fields.firstName && fields.firstName.length <= 20 ? fields.firstName : null,
      lastName: fields.lastName && fields.lastName.length <= 20 ? fields.lastName : null,
    };

    return {
      ...normalized,
      score: this.scorePassportData(normalized),
      isCredible: this.hasCrediblePassportData(normalized),
    };
  }

  static hasCrediblePassportData(fields: PassportDataFields): boolean {
    return this.isValidCardNumber(fields.cardNumber) || this.isValidJshshir(fields.jshshir);
  }

  static scorePassportData(fields: PassportDataFields): number {
    let score = 0;

    if (this.isValidCardNumber(fields.cardNumber)) {
      score += 3;
    } else if (fields.cardNumber) {
      score += 1;
    }

    if (this.isValidJshshir(fields.jshshir)) {
      score += 3;
    } else if (fields.jshshir) {
      score += 1;
    }

    if (fields.firstName) score += 1;
    if (fields.lastName) score += 1;

    return score;
  }

  static isValidCardNumber(cardNumber: string | null | undefined): boolean {
    return !!cardNumber && /^[A-Z]{2}\d{7}$/.test(cardNumber);
  }

  static isValidJshshir(jshshir: string | null | undefined): boolean {
    return !!jshshir && /^\d{14}$/.test(jshshir);
  }

  private static extractNames(text: string): { firstName: string | null; lastName: string | null } {
    let firstName: string | null = null;
    let lastName: string | null = null;

    const mrzIdCardMatch = text.match(/\b([A-Z]+)<<([A-Z]+)<{2,}\b/i);
    if (mrzIdCardMatch) {
      lastName = mrzIdCardMatch[1];
      firstName = mrzIdCardMatch[2];
      return { firstName, lastName };
    }

    const mrzPassportMatch = text.match(/P<UZB([A-Z]+)<<([A-Z]+)<{2,}/i);
    if (mrzPassportMatch) {
      lastName = mrzPassportMatch[1];
      firstName = mrzPassportMatch[2];
      return { firstName, lastName };
    }

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toUpperCase();

      if (line.includes('SURNAME') || line.includes('FAMILIYA')) {
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].replace(/[^A-Z\s-]/gi, '').trim();
          if (nextLine.length > 1 && !nextLine.includes('ISMI') && !nextLine.includes('GIVEN')) {
            lastName = nextLine;
          }
        }
      }

      if ((line.includes('GIVEN') || line.includes('ISMI')) && !line.includes('OTASINING')) {
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].replace(/[^A-Z\s-]/gi, '').trim();
          if (
            nextLine.length > 1 &&
            !nextLine.includes('FUQAROLIGI') &&
            !nextLine.includes('NATIONALITY')
          ) {
            firstName = nextLine;
          }
        }
      }
    }

    if (firstName && firstName.length <= 20) {
      firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    } else {
      firstName = null;
    }

    if (lastName && lastName.length <= 20) {
      lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
    } else {
      lastName = null;
    }

    return { firstName, lastName };
  }

  private static extractJShShIR(text: string): string | null {
    const cleanText = text.replace(/\s/g, '');
    const mrzMatch = cleanText.match(/[IPAC][A-Z<]UZB[A-Z0-9<]{9}[0-9<]([0-9]{14})/i);
    if (mrzMatch && mrzMatch[1]) {
      return mrzMatch[1];
    }

    const allMatches = text.match(/\d{14}/g) || [];
    for (const match of allMatches) {
      if (/^[3456]/.test(match)) {
        return match;
      }
    }

    return allMatches[0] || null;
  }

  private static extractCardNumber(text: string): string | null {
    const cleanText = text.replace(/\s/g, '');
    const mrzMatch = cleanText.match(/[IPAC][A-Z<]UZB([A-Z0-9<]{9})/i);
    if (mrzMatch && mrzMatch[1]) {
      return mrzMatch[1].replace(/</g, '');
    }

    const standardMatch = text.match(/([A-Z]{2})\s*(\d{7})/i);
    if (standardMatch) {
      return (standardMatch[1] + standardMatch[2]).toUpperCase();
    }

    const words = text.split(/[\n\s,;|]+/);
    for (const word of words) {
      const cleanWord = word.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (cleanWord.length === 9 && /^[A-Z]{2}\d{7}$/.test(cleanWord)) {
        return cleanWord;
      }
    }

    return null;
  }
}
