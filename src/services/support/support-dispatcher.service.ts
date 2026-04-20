import { logger } from '../../utils/logger';

type SupportJob = () => Promise<void>;

export class SupportDispatcherService {
  private static readonly userPipelines = new Map<number, Promise<void>>();

  static enqueue(params: {
    userTelegramId: number;
    label: string;
    job: SupportJob;
  }): void {
    const previousPipeline = this.userPipelines.get(params.userTelegramId) || Promise.resolve();

    const nextPipeline = previousPipeline
      .catch((error) => {
        logger.error(
          `[SUPPORT_DISPATCHER] Previous background job failed for user ${params.userTelegramId}`,
          error,
        );
      })
      .then(async () => {
        logger.info(
          `[SUPPORT_DISPATCHER] Started background job "${params.label}" for user ${params.userTelegramId}`,
        );

        try {
          await params.job();
        } finally {
          logger.info(
            `[SUPPORT_DISPATCHER] Finished background job "${params.label}" for user ${params.userTelegramId}`,
          );
        }
      })
      .catch((error) => {
        logger.error(
          `[SUPPORT_DISPATCHER] Background job "${params.label}" failed for user ${params.userTelegramId}`,
          error,
        );
      })
      .finally(() => {
        if (this.userPipelines.get(params.userTelegramId) === nextPipeline) {
          this.userPipelines.delete(params.userTelegramId);
        }
      });

    this.userPipelines.set(params.userTelegramId, nextPipeline);
  }

  static async whenIdle(userTelegramId: number): Promise<void> {
    await (this.userPipelines.get(userTelegramId) || Promise.resolve());
  }
}
