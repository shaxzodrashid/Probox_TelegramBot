/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'path';
import { HanaService } from '../sap/hana.service';
import { SapService } from '../sap/sap-hana.service';
import { IBusinessPartner } from '../interfaces/business-partner.interface';
import { normalizeUzPhone } from '../utils/uz-phone.util';
import { selectPreferredSapBusinessPartner } from '../utils/sap-business-partner.util';

dotenv.config({ path: path.join(process.cwd(), '.env') });

interface CliArgs {
  jshshir?: string;
  phoneNumber?: string;
}

type LookupType = 'jshshir' | 'phone_number';

interface LookupResult {
  lookupType: LookupType;
  lookupValue: string;
  partners: IBusinessPartner[];
}

function sanitize(value: string): string {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = sanitize(argv[i]);
    const next = argv[i + 1] ? sanitize(argv[i + 1]) : undefined;

    if ((arg === '--jshshir' || arg === '-j') && next) {
      args.jshshir = next;
      i += 1;
      continue;
    }

    if (
      (arg === '--phone_number' || arg === '--phone-number' || arg === '--phone' || arg === '-p') &&
      next
    ) {
      args.phoneNumber = next;
      i += 1;
      continue;
    }

    if (arg.includes('=')) {
      const [key, ...rest] = arg.split('=');
      const value = sanitize(rest.join('='));

      if ((key === '--jshshir' || key === 'jshshir') && value) {
        args.jshshir = value;
        continue;
      }

      if (
        (key === '--phone_number' ||
          key === '--phone-number' ||
          key === '--phone' ||
          key === 'phone_number' ||
          key === 'phoneNumber' ||
          key === 'phone') &&
        value
      ) {
        args.phoneNumber = value;
        continue;
      }
    }

    if (arg) {
      positional.push(arg);
    }
  }

  if (!args.jshshir && !args.phoneNumber && positional.length > 0) {
    const value = positional[0];
    const digits = value.replace(/\D/g, '');

    if (/^\d{14}$/.test(digits)) {
      args.jshshir = digits;
    } else {
      args.phoneNumber = value;
    }
  }

  return args;
}

function printUsage(): void {
  console.log('Usage:');
  console.log('  npm run debug:business-partner -- --jshshir 12345678901234');
  console.log('  npm run debug:business-partner -- --phone_number +998901234567');
  console.log('  npm run debug:business-partner -- 12345678901234');
  console.log('  npm run debug:business-partner -- +998901234567');
}

function validateArgs(args: CliArgs): CliArgs {
  if (!args.jshshir && !args.phoneNumber) {
    throw new Error('Either --jshshir or --phone_number is required.');
  }

  if (args.jshshir && args.phoneNumber) {
    throw new Error('Use either --jshshir or --phone_number, not both.');
  }

  if (args.jshshir && !/^\d{14}$/.test(args.jshshir)) {
    throw new Error('jshshir must contain exactly 14 digits.');
  }

  if (args.phoneNumber) {
    normalizeUzPhone(args.phoneNumber);
  }

  return args;
}

async function lookupBusinessPartner(sapService: SapService, args: CliArgs): Promise<LookupResult> {
  if (args.jshshir) {
    return {
      lookupType: 'jshshir',
      lookupValue: args.jshshir,
      partners: await sapService.getBusinessPartnerByJshshir(args.jshshir),
    };
  }

  if (!args.phoneNumber) {
    throw new Error('phone_number is missing.');
  }

  const normalizedPhone = normalizeUzPhone(args.phoneNumber).full;

  return {
    lookupType: 'phone_number',
    lookupValue: normalizedPhone,
    partners: await sapService.getBusinessPartnerByPhone(args.phoneNumber),
  };
}

function printResult(result: LookupResult): void {
  console.log(`Lookup: ${result.lookupType}=${result.lookupValue}`);

  if (result.partners.length === 0) {
    console.log('No business partner found.');
    return;
  }

  const preferredPartner = selectPreferredSapBusinessPartner(result.partners);

  if (preferredPartner) {
    console.log(`Preferred CardCode: ${preferredPartner.CardCode}`);
  }

  console.table(
    result.partners.map((partner) => ({
      CardCode: partner.CardCode,
      CardName: partner.CardName,
      CardType: partner.CardType,
      Phone1: partner.Phone1 || '',
      Phone2: partner.Phone2 || '',
      U_admin: partner.U_admin || '',
    })),
  );

  console.log('Raw JSON:');
  console.log(JSON.stringify(result.partners, null, 2));
}

async function main(): Promise<void> {
  let args: CliArgs;

  try {
    args = validateArgs(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exit(1);
  }

  const sapService = new SapService(new HanaService());

  try {
    const result = await lookupBusinessPartner(sapService, args);
    printResult(result);
  } catch (error) {
    console.error('Failed to fetch business partner from SAP:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
