import { config } from '../../config';
import { logger } from '../logger';
import { getMigratedChatId } from './telegram-errors';

let runtimeAdminGroupChatId: string | null = null;

const normalizeChatId = (value: string | number | null | undefined): string => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

export const getAdminGroupChatId = (): string => runtimeAdminGroupChatId || config.SUPPORT_GROUP_ID;

export const hasAdminGroupChatId = (): boolean => Boolean(getAdminGroupChatId());

export const syncAdminGroupChatIdFromError = (error: unknown): string | null => {
  const migratedChatId = getMigratedChatId(error);
  if (!migratedChatId) {
    return null;
  }

  const normalizedChatId = normalizeChatId(migratedChatId);
  if (!normalizedChatId) {
    return null;
  }

  if (runtimeAdminGroupChatId !== normalizedChatId) {
    runtimeAdminGroupChatId = normalizedChatId;
    logger.warn(
      `[TELEGRAM] Admin group chat migrated to ${normalizedChatId}. Update SUPPORT_GROUP_ID in .env to keep this after restart.`,
    );
  }

  return normalizedChatId;
};

export const withAdminGroupMigrationRetry = async <T>(
  operation: (chatId: string) => Promise<T>,
): Promise<T> => {
  const chatId = getAdminGroupChatId();
  if (!chatId) {
    throw new Error('SUPPORT_GROUP_ID is not configured');
  }

  try {
    return await operation(chatId);
  } catch (error) {
    const migratedChatId = syncAdminGroupChatIdFromError(error);
    if (!migratedChatId || migratedChatId === chatId) {
      throw error;
    }

    return operation(migratedChatId);
  }
};
