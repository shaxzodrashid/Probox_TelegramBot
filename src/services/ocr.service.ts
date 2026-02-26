import Ocr from '@gutenye/ocr-node';
import { logger } from '../utils/logger';

export interface OCRResult {
  cardNumber: string | null;
  jshshir: string | null;
  firstName: string | null;
  lastName: string | null;
  text: string;
}

export class OCRService {
  private static ocrInstance: any = null;

  static async getOcrInstance() {
    if (!this.ocrInstance) {
      this.ocrInstance = await Ocr.create();
    }
    return this.ocrInstance;
  }

  /**
   * Recognizes text from an image buffer using @gutenye/ocr-node
   * @param imageBuffer The image buffer to process
   * @returns Recognised text
   */
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

  /**
   * Extracts passport/ID card data (JShShIR and Card Number) from an image
   * @param imageBuffer The image buffer to process
   * @returns OCRResult containing extracted fields and full text
   */
  static async extractPassportData(imageBuffer: Buffer): Promise<OCRResult> {
    // We use eng for better character recognition of digits and latin letters
    logger.debug('[OCR] Starting text recognition...');
    const text = await this.recognizeText(imageBuffer);
    logger.debug('[OCR] Recognition result:', text);
    
    let jshshir: string | null = null;
    let cardNumber: string | null = null;

    // Split text into lines to process the specific book-like passport MRZ schema
    const lines = text.split('\n').map(l => l.replace(/\s+/g, '')).filter(l => l.length > 0);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Validating the schema: the second line of MRZ is ~44 chars
        // First 9 letters are Card Number, 14 digits JShShIR are located before the last 2 digits.
        if (line.length >= 42 && line.length <= 48) {
            const extractedCardNum = line.slice(0, 9).replace(/</g, '').toUpperCase();
            
            // Extract JShShIR using the updated rule:
            // Find latest letter, skip 7 digits from it and count 14 digits from there
            const lastLetterMatch = [...line.matchAll(/[A-Z]/gi)].pop();
            
            if (lastLetterMatch && lastLetterMatch.index !== undefined) {
              const skipCount = 7 + 1; // skip the letter itself + 7 digits
              const rawJshshir = line.slice(lastLetterMatch.index + skipCount, lastLetterMatch.index + skipCount + 14);
              
              // Clean up common OCR mistakes for digits
              const cleanedJshshir = rawJshshir.replace(/O|o/g, '0').replace(/I|i|l/g, '1').replace(/S|s/g, '5');

              if (/^[A-Z0-9]{7,9}$/i.test(extractedCardNum) && /^\d{14}$/.test(cleanedJshshir)) {
                  cardNumber = extractedCardNum;
                  jshshir = cleanedJshshir;
                  break;
              }
            }
        }
    }

    const names = this.extractNames(text);

    return {
      text,
      jshshir: jshshir || this.extractJShShIR(text),
      cardNumber: cardNumber || this.extractCardNumber(text),
      firstName: names.firstName,
      lastName: names.lastName,
    };
  }

  /**
   * Internal logic to extract First Name and Last Name from OCR text
   */
  private static extractNames(text: string): { firstName: string | null, lastName: string | null } {
    let firstName: string | null = null;
    let lastName: string | null = null;
    
    // Strategy 1: Look for ID card MRZ format (3 lines, name on line 3)
    // MRZ line 3 example: RASHIDOV<<SHAXZOD<<<<<<<<<<<<<
    const mrzIdCardMatch = text.match(/\\b([A-Z]+)<<([A-Z]+)<{2,}\\b/i);
    if (mrzIdCardMatch) {
      lastName = mrzIdCardMatch[1];
      firstName = mrzIdCardMatch[2];
      return { firstName, lastName };
    }

    // Strategy 2: Look for Passport MRZ format (2 lines, name on line 1)
    // MRZ line 1 example: P<UZBTURDIEV<<ISLOMDJON<<<<<<<<<<<<<<<<<<<<<
    const mrzPassportMatch = text.match(/P<UZB([A-Z]+)<<([A-Z]+)<{2,}/i);
    if (mrzPassportMatch) {
      lastName = mrzPassportMatch[1];
      firstName = mrzPassportMatch[2];
      return { firstName, lastName };
    }

    // Strategy 3: Look for English Keywords SURNAME / GIVEN NAMES
    const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toUpperCase();
      
      // Look for SURNAME
      if (line.includes('SURNAME') || line.includes('FAMILIYA')) {
        // usually the next line contains the actual surname
        if (i + 1 < lines.length) {
          const nextLine = lines[i+1].replace(/[^A-Z\\s-]/gi, '').trim();
          if (nextLine.length > 1 && !nextLine.includes('ISMI') && !nextLine.includes('GIVEN')) {
            lastName = nextLine;
          }
        }
      }
      
      // Look for GIVEN NAMES
      if (line.includes('GIVEN') || line.includes('ISMI') && !line.includes('OTASINING')) {
        if (i + 1 < lines.length) {
          const nextLine = lines[i+1].replace(/[^A-Z\\s-]/gi, '').trim();
          if (nextLine.length > 1 && !nextLine.includes('FUQAROLIGI') && !nextLine.includes('NATIONALITY')) {
            firstName = nextLine;
          }
        }
      }
    }

    // capitalize properly
    if (firstName) firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    if (lastName) lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();

    return { firstName, lastName };
  }

  /**
   * Internal logic to extract JShShIR (14 digits)
   */
  private static extractJShShIR(text: string): string | null {
    // JShShIR is a 14-digit number.
    // Issue: MRZ Line 2 also has 14 digits (DoB + Expiry info).
    // Strategy 1: Look for MRZ Line 1 pattern which contains both Card Number and JShShIR
    const cleanText = text.replace(/\s/g, '');
    const mrzMatch = cleanText.match(/[IPAC][A-Z<]UZB[A-Z0-9<]{9}[0-9<]([0-9]{14})/i);
    if (mrzMatch && mrzMatch[1]) {
      return mrzMatch[1];
    }

    // Strategy 2: Look for 14-digit sequence that DOES NOT look like DoB+Expiry
    // JShShIR usually starts with 3, 4, 5, or 6 in Uzbekistan.
    const allMatches = text.match(/\d{14}/g) || [];
    for (const match of allMatches) {
        // Simple heuristic: JShShIR is usually more "random" than DoB+Expiry
        // And it often starts with 3, 4, 5, 6
        if (/^[3456]/.test(match)) {
            return match;
        }
    }

    // Strategy 3: Fallback to the first 14-digit sequence found
    const firstMatch = allMatches[0];
    return firstMatch || null;
  }

  /**
   * Internal logic to extract Card Number (e.g. AA1234567)
   */
  private static extractCardNumber(text: string): string | null {
    // Strategy 1: MRZ format in MRV zone
    const cleanText = text.replace(/\s/g, '');
    const mrzMatch = cleanText.match(/[IPAC][A-Z<]UZB([A-Z0-9<]{9})/i);
    if (mrzMatch && mrzMatch[1]) {
      return mrzMatch[1].replace(/</g, '');
    }

    // Strategy 2: Standard series (2 letters) + 7 digits
    const standardMatch = text.match(/([A-Z]{2})\s*(\d{7})/i);
    if (standardMatch) {
      return (standardMatch[1] + standardMatch[2]).toUpperCase();
    }

    // Strategy 3: Just look for 9-char alphanumeric group that looks like a card number
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
