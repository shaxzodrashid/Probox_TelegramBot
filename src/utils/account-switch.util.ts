import { minioService } from '../services/minio.service';
import { logger } from './logger';

export async function clearAccountSwitchArtifacts(telegramId: number): Promise<void> {
  const cleanupTargets = [
    `passports/${telegramId}/`,
    `face_id/${telegramId}/`,
  ];

  const results = await Promise.allSettled(
    cleanupTargets.map((prefix) => minioService.deleteFilesByPrefix(prefix)),
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.warn(
        `[ACCOUNT_SWITCH] Failed to clear stored artifacts for ${cleanupTargets[index]}: ${String(result.reason)}`,
      );
    }
  });
}
