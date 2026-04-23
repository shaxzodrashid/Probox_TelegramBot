import { PaymentOnTimeCouponRepairService } from '../services/coupon/payment-on-time-coupon-repair.service';
import { logger } from '../utils/logger';

function parseArgs(argv: string[]): {
  dryRun: boolean;
  notify: boolean;
} {
  const args = new Set(argv);
  const execute = args.has('--execute');
  const dryRun = args.has('--dry-run') || !execute;
  const notify = execute && args.has('--notify');
  const supportedArgs = new Set(['--dry-run', '--execute', '--notify']);

  for (const arg of args) {
    if (!supportedArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.has('--dry-run') && execute) {
    throw new Error('Use either --dry-run or --execute, not both.');
  }

  return {
    dryRun,
    notify,
  };
}

async function main(): Promise<void> {
  const { dryRun, notify } = parseArgs(process.argv.slice(2));
  const result = await PaymentOnTimeCouponRepairService.repairHistoricalCoupons({
    dryRun,
    notify,
  });

  logger.info(
    `[PAYMENT_ON_TIME_REPAIR] Mode=${dryRun ? 'dry-run' : 'execute'} notify=${notify} summary=${JSON.stringify(result)}`,
  );
}

main().catch((error) => {
  logger.error('[PAYMENT_ON_TIME_REPAIR] Run failed', error);
  process.exitCode = 1;
});
