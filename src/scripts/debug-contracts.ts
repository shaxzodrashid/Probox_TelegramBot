/* eslint-disable no-console */
import * as dotenv from 'dotenv';
import path from 'path';
import { SapService } from '../sap/sap-hana.service';
import { HanaService } from '../sap/hana.service';
import { IPurchaseInstallment } from '../interfaces/purchase.interface';

dotenv.config({ path: path.join(process.cwd(), '.env') });

interface CliArgs {
  cardCode?: string;
  jshshir?: string;
}

interface ContractSummary {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName: string;
  DocDate: string;
  DocDueDate: string;
  Installments: number;
  Total: number;
  TotalPaid: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const positional: string[] = [];
  const sanitize = (value: string) =>
    value
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .trim();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = sanitize(argv[i]);
    const next = argv[i + 1] ? sanitize(argv[i + 1]) : undefined;

    if ((arg === '--cardCode' || arg === '-c') && next) {
      args.cardCode = next;
      i += 1;
      continue;
    }

    if ((arg === '--jshshir' || arg === '-j') && next) {
      args.jshshir = next;
      i += 1;
      continue;
    }

    if (arg.includes('=')) {
      const [key, ...rest] = arg.split('=');
      const value = sanitize(rest.join('='));

      if ((key === '--cardCode' || key === 'cardCode') && value) {
        args.cardCode = value;
        continue;
      }

      if ((key === '--jshshir' || key === 'jshshir') && value) {
        args.jshshir = value;
        continue;
      }
    }

    if (arg) {
      positional.push(arg);
    }
  }

  if (!args.cardCode && !args.jshshir && positional.length > 0) {
    const value = positional[0];
    if (/^\d{14}$/.test(value)) {
      args.jshshir = value;
    } else {
      args.cardCode = value;
    }
  }

  return args;
}

function printUsage() {
  console.log('Usage:');
  console.log('  npm run debug:contracts -- --cardCode C12345');
  console.log('  npm run debug:contracts -- --jshshir 12345678901234');
  console.log('  npm run debug:contracts -- 12345678901234');
}

async function main() {
  const { cardCode, jshshir } = parseArgs(process.argv.slice(2));

  if (!cardCode && !jshshir) {
    printUsage();
    process.exit(1);
  }

  const sapService = new SapService(new HanaService());
  let resolvedCardCode = cardCode;

  try {
    if (!resolvedCardCode && jshshir) {
      console.log(`Resolving CardCode for JSHSHIR: ${jshshir}`);
      const partners = await sapService.getBusinessPartnerByJshshir(jshshir);

      if (partners.length === 0) {
        console.log('No business partner found for this JSHSHIR.');
        process.exit(1);
      }

      console.table(
        partners.map((partner) => ({
          CardCode: partner.CardCode,
          CardName: partner.CardName,
          Phone1: partner.Phone1,
          Phone2: partner.Phone2,
        })),
      );

      resolvedCardCode = partners[0].CardCode?.trim();
      console.log(`Using CardCode: ${resolvedCardCode}`);
    }

    if (!resolvedCardCode) {
      console.log('CardCode could not be resolved.');
      process.exit(1);
    }

    console.log(`\nFetching raw SAP contract rows for CardCode: ${resolvedCardCode}\n`);
    const rows: IPurchaseInstallment[] = await sapService.getBPpurchasesByCardCode(
      resolvedCardCode,
    );

    if (rows.length === 0) {
      console.log('No contract rows returned from SAP.');
      return;
    }

    console.log('Raw SAP rows:');
    console.table(
      rows.map((row) => ({
        DocEntry: row.DocEntry,
        DocNum: row.DocNum,
        CardCode: row.CardCode,
        CardName: row.CardName,
        DocDate: row.DocDate,
        DocDueDate: row.DocDueDate,
        InstlmntID: row.InstlmntID,
        InstDueDate: row.InstDueDate,
        InstStatus: row.InstStatus,
        Total: row.Total,
        TotalPaid: row.TotalPaid,
        InstTotal: row.InstTotal,
        InstPaidSys: row.InstPaidSys,
      })),
    );

    const uniqueContracts = Array.from(
      rows.reduce((map, row) => {
        if (!map.has(row.DocEntry)) {
          map.set(row.DocEntry, {
            DocEntry: row.DocEntry,
            DocNum: row.DocNum,
            CardCode: row.CardCode,
            CardName: row.CardName,
            DocDate: row.DocDate,
            DocDueDate: row.DocDueDate,
            Installments: 1,
            Total: row.Total,
            TotalPaid: row.TotalPaid,
          });
        } else {
          const contract = map.get(row.DocEntry);
          if (contract) {
            contract.Installments += 1;
          }
        }

        return map;
      }, new Map<number, ContractSummary>()),
    ).map(([, value]) => value);

    console.log('\nGrouped contract summary:');
    console.table(uniqueContracts);
  } catch (error) {
    console.error('Failed to fetch contracts from SAP:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
