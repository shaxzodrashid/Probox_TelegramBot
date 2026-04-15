import { BotContext, BotConversation } from '../../types/context';
import { config } from '../../config';
import axios from 'axios';
import { logger } from '../../utils/logger';

export async function getTelegramFilePath(ctx: BotContext, fileId: string): Promise<string | null> {
  try {
    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) return null;
    return file.file_path;
  } catch (e) {
    logger.error('Error resolving passport image file path:', e);
    return null;
  }
}

export async function downloadFileByPath(filePath: string): Promise<Buffer | null> {
  try {
    const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${filePath}`;
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    return Buffer.from(response.data);
  } catch (e) {
    logger.error('Error downloading passport image:', e);
    return null;
  }
}

export function normalizeButtonText(value?: string): string {
  return (value || '')
    .normalize('NFKC')
    // Remove emojis and special characters
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    // Remove variation selectors and other invisibles
    .replace(/[\uFE0F\u200D\u200B\u200C]/g, '')
    // Unify all types of quotes and apostrophes to standard single quote
    .replace(/[\u02BB\u02BC\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export async function flushConversation(_conversation: BotConversation) {
  // Clearing queued updates is not directly supported in grammY v2 as it uses a replay engine.
  // Updates are delivered sequentially by the bot runner. To ignore "stale" input,
  // compare the update timestamp with a 'start' time captured via conversation.now().
  return;
}
