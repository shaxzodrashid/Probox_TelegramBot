import { InlineKeyboard, InputFile } from 'grammy';
import { BotContext } from '../types/context';
import { getPaginatedContracts, mockContracts } from '../data/contracts.mock';
import { logger } from '../utils/logger';
import { minioService } from '../services/minio.service';

const PAGE_SIZE = 10;


/**
 * Build the contracts list message with inline keyboard
 */
const buildContractsMessage = (page: number, locale: string) => {
  const { items, currentPage, totalPages, totalItems, hasNextPage, hasPrevPage } =
    getPaginatedContracts(page, PAGE_SIZE);

  // Build message text
  const isUzbek = locale === 'uz';
  const header = isUzbek
    ? `📄 *Sizning shartnomalaringiz*\n\n`
    : `📄 *Ваши контракты*\n\n`;

  const pageInfo = isUzbek
    ? `📋 Jami: ${totalItems} ta shartnoma | Sahifa: ${currentPage}/${totalPages}\n\n`
    : `📋 Всего: ${totalItems} контрактов | Страница: ${currentPage}/${totalPages}\n\n`;

  // Simple list with only item names
  let contractsList = '';
  items.forEach((contract, index) => {
    const number = (currentPage - 1) * PAGE_SIZE + index + 1;
    contractsList += `*${number}.* ${contract.itemName}\n`;
  });

  const text = header + pageInfo + contractsList;

  // Build inline keyboard
  const keyboard = new InlineKeyboard();

  // Add numbered download buttons in 2 rows (5 buttons per row max)
  const BUTTONS_PER_ROW = 5;
  items.forEach((contract, index) => {
    const number = (currentPage - 1) * PAGE_SIZE + index + 1;
    keyboard.text(`${number}`, `download_contract:${contract.id}`);
    
    // Add row break after every 5 buttons
    if ((index + 1) % BUTTONS_PER_ROW === 0) {
      keyboard.row();
    }
  });

  // Ensure we start a new row for pagination if last row wasn't complete
  if (items.length % BUTTONS_PER_ROW !== 0) {
    keyboard.row();
  }

  // Add pagination row: ⬅️ | 🔙 Orqaga | ➡️
  const backText = isUzbek ? '🔙 Orqaga' : '🔙 Назад';
  
  if (hasPrevPage) {
    keyboard.text('⬅️', `contracts_page:${currentPage - 1}`);
  }
  
  keyboard.text(backText, 'back_to_menu');
  
  if (hasNextPage) {
    keyboard.text('➡️', `contracts_page:${currentPage + 1}`);
  }

  return { text, keyboard };
};

/**
 * Handler for showing contracts list
 */
export const contractsHandler = async (ctx: BotContext) => {
  logger.info(`[CONTRACTS] User ${ctx.from?.id} opened contracts list`);

  const locale = await ctx.i18n.getLocale() || 'uz';
  const { text, keyboard } = buildContractsMessage(1, locale);

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
};

/**
 * Handler for pagination callback
 */
export const contractsPaginationHandler = async (ctx: BotContext) => {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) return;

  const page = parseInt(callbackData.split(':')[1], 10);
  if (isNaN(page)) return;

  logger.info(`[CONTRACTS] User ${ctx.from?.id} navigated to page ${page}`);

  const locale = await ctx.i18n.getLocale() || 'uz';
  const { text, keyboard } = buildContractsMessage(page, locale);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
  await ctx.answerCallbackQuery();
};

/**
 * Handler for download contract callback - fetches PDF from MinIO and sends to user
 */
export const downloadContractHandler = async (ctx: BotContext) => {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) return;

  const contractId = callbackData.split(':')[1];
  logger.info(`[CONTRACTS] User ${ctx.from?.id} requested download of contract ${contractId}`);

  // Get locale - try i18n first, then session, then default to 'uz'
  const i18nLocale = await ctx.i18n.getLocale();
  const sessionLocale = ctx.session?.__language_code;
  const locale = i18nLocale || sessionLocale || 'uz';
  
  logger.info(`[CONTRACTS] Locale detection - i18n: ${i18nLocale}, session: ${sessionLocale}, using: ${locale}`);
  
  // Show loading message
  const loadingMessage = locale === 'uz'
    ? '📥 PDF yuklanmoqda...'
    : '📥 Загрузка PDF...';
  
  await ctx.answerCallbackQuery({
    text: loadingMessage,
  });

  try {
    // For now, using the mock PDF file path
    // In production, construct the path based on user's CardCode or contract data
    // Example: `${userCardCode}/${contractNumber}.pdf`
    const pdfPath = 'bp-files/5672248725/test.pdf';
    
    // Check if file exists
    logger.info(`[CONTRACTS] Checking if file exists in MinIO: ${pdfPath}`);
    const fileExists = await minioService.fileExists(pdfPath);
    logger.info(`[CONTRACTS] File exists: ${fileExists}`);
    
    if (!fileExists) {
      const errorMessage = locale === 'uz'
        ? '❌ PDF fayl topilmadi. Iltimos, keyinroq urinib ko\'ring.'
        : '❌ PDF файл не найден. Пожалуйста, попробуйте позже.';
      
      await ctx.reply(errorMessage);
      return;
    }

    // Get the PDF file as buffer
    const pdfBuffer = await minioService.getFileAsBuffer(pdfPath);
    
    // Find the contract to get its name for the filename
    const contract = mockContracts.find(c => c.id === contractId);
    const fileName = contract 
      ? `${contract.contractNumber}_${contract.itemName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      : `contract_${contractId}.pdf`;

    // Send the PDF document to the user
    await ctx.replyWithDocument(
      new InputFile(pdfBuffer, fileName),
      {
        caption: locale === 'uz'
          ? `📄 Shartnoma: ${contract?.itemName || contractId}`
          : `📄 Контракт: ${contract?.itemName || contractId}`,
      }
    );

    logger.info(`[CONTRACTS] Successfully sent PDF for contract ${contractId} to user ${ctx.from?.id}`);

  } catch (error) {
    logger.error(`[CONTRACTS] Error downloading PDF for contract ${contractId}: ${error}`);
    
    const errorMessage = locale === 'uz'
      ? '❌ PDF yuklashda xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.'
      : '❌ Ошибка при загрузке PDF. Пожалуйста, попробуйте позже.';
    
    await ctx.reply(errorMessage);
  }
};

/**
 * Handler for back to menu callback
 */
export const backToMenuHandler = async (ctx: BotContext) => {
  await ctx.deleteMessage().catch(() => {});
  await ctx.answerCallbackQuery();
};
