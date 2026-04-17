import axios from 'axios';
import { BotContext } from '../../types/context';
import { config } from '../../config';
import { logger } from '../logger';

export async function getTelegramFilePath(ctx: BotContext, fileId: string): Promise<string | null> {
  try {
    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) {
      return null;
    }
    return file.file_path;
  } catch (error) {
    logger.error('Error resolving Telegram file path:', error);
    return null;
  }
}

export async function downloadTelegramFileByPath(filePath: string): Promise<Buffer | null> {
  try {
    const url = `https://api.telegram.org/file/bot${config.BOT_TOKEN}/${filePath}`;
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    return Buffer.from(response.data);
  } catch (error) {
    logger.error('Error downloading Telegram file:', error);
    return null;
  }
}
