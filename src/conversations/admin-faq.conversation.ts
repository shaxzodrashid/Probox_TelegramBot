import { InlineKeyboard, Keyboard } from 'grammy';
import { config } from '../config';
import { i18n } from '../i18n';
import { showAdminFaqDetailCard } from '../handlers/admin.handler';
import { FaqAiService } from '../services/faq/faq-ai.service';
import { FaqEmbeddingService } from '../services/faq/faq-embedding.service';
import { FaqService } from '../services/faq/faq.service';
import { BotContext, BotConversation, FaqEditableField, SessionData } from '../types/context';
import { FaqAnswerVariants, FaqNeighbor, FaqQuestionVariants, FaqRecord } from '../types/faq.types';
import { escapeHtml } from '../utils/telegram/telegram-rich-text.util';
import { logger } from '../utils/logger';
import { getAdminMenuKeyboard } from '../keyboards/admin.keyboards';

const FAQ_QUESTION_CONFIRM_CALLBACK = 'faq_question_confirm';
const FAQ_QUESTION_REGENERATE_CALLBACK = 'faq_question_regenerate';
const FAQ_QUESTION_CANCEL_CALLBACK = 'faq_question_cancel';
const FAQ_ANSWER_CONFIRM_CALLBACK = 'faq_answer_confirm';
const FAQ_ANSWER_REJECT_CALLBACK = 'faq_answer_reject';
const FAQ_ANSWER_MANUAL_CALLBACK = 'faq_answer_manual';
const FAQ_ANSWER_REGENERATE_CALLBACK = 'faq_answer_regenerate';
const FAQ_MODE_ANSWER_CALLBACK = 'faq_mode_answer';
const FAQ_MODE_AGENT_CALLBACK = 'faq_mode_agent';
const FAQ_MANUAL_CONFIRM_CALLBACK = 'faq_manual_confirm';
const FAQ_MANUAL_REENTER_CALLBACK = 'faq_manual_reenter';
const FAQ_AGENT_CONFIRM_CALLBACK = 'faq_agent_confirm';
const FAQ_AGENT_CANCEL_CALLBACK = 'faq_agent_cancel';

const getCancelKeyboard = (locale: string) =>
  new Keyboard().text(i18n.t(locale, 'admin_cancel')).resized().oneTime();

const getQuestionReviewKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_confirm_yes'), FAQ_QUESTION_CONFIRM_CALLBACK)
    .text(i18n.t(locale, 'admin_faq_regenerate'), FAQ_QUESTION_REGENERATE_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_cancel'), FAQ_QUESTION_CANCEL_CALLBACK);

const getAnswerReviewKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_confirm_yes'), FAQ_ANSWER_CONFIRM_CALLBACK)
    .text(i18n.t(locale, 'admin_confirm_no'), FAQ_ANSWER_REJECT_CALLBACK);

const getAnswerModeKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_faq_add_answer'), FAQ_MODE_ANSWER_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_faq_mark_for_agent'), FAQ_MODE_AGENT_CALLBACK);

const getAnswerRejectedKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_faq_enter_manual_answers'), FAQ_ANSWER_MANUAL_CALLBACK)
    .row()
    .text(i18n.t(locale, 'admin_faq_regenerate_with_instructions'), FAQ_ANSWER_REGENERATE_CALLBACK);

const getManualAnswerConfirmKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_confirm_yes'), FAQ_MANUAL_CONFIRM_CALLBACK)
    .text(i18n.t(locale, 'admin_faq_reenter_manual_answers'), FAQ_MANUAL_REENTER_CALLBACK);

const getAgentModeConfirmKeyboard = (locale: string) =>
  new InlineKeyboard()
    .text(i18n.t(locale, 'admin_confirm_yes'), FAQ_AGENT_CONFIRM_CALLBACK)
    .text(i18n.t(locale, 'admin_confirm_no'), FAQ_AGENT_CANCEL_CALLBACK);

const getBlockedExitTexts = (locale: string): string[] => [
  i18n.t(locale, 'admin_cancel'),
  i18n.t(locale, 'back'),
  i18n.t(locale, 'back_to_user_menu'),
  i18n.t(locale, 'admin_menu'),
  i18n.t(locale, 'admin_users'),
  i18n.t(locale, 'admin_branches'),
  i18n.t(locale, 'admin_broadcast'),
  i18n.t(locale, 'admin_stats'),
  i18n.t(locale, 'admin_campaign_promotions'),
  i18n.t(locale, 'admin_campaign_prizes'),
  i18n.t(locale, 'admin_campaign_templates'),
  i18n.t(locale, 'admin_campaign_coupon_search'),
  i18n.t(locale, 'admin_campaign_coupon_export'),
  i18n.t(locale, 'admin_export'),
  i18n.t(locale, 'admin_faqs'),
];

const isBlockedExitCallback = (data: string): boolean =>
  ['admin_cancel', 'admin_back_to_menu', 'admin_faq_back'].includes(data);

const getSession = (ctx: BotContext): SessionData => {
  if (!ctx.session) {
    ctx.session = {};
  }

  return ctx.session;
};

const clearFaqSession = (ctx: BotContext) => {
  const session = getSession(ctx);
  session.adminFaqSourceQuestion = undefined;
  session.adminFaqQuestionVariants = undefined;
  session.adminFaqDraftId = undefined;
  session.adminFaqAnswerVariants = undefined;
  session.adminFaqAnswerRegenerationInstructions = undefined;
  session.adminFaqAgentToken = undefined;
  session.adminFaqEditTarget = undefined;
};

const buildAgentFaqToken = (faqId: number): string => `__AGENT_FAQ_${faqId}__`;

const getLocale = async (conversation: BotConversation): Promise<string> => {
  const session = await conversation.external((ctx) => ctx.session);
  return session?.__language_code || 'uz';
};

const buildQuestionReviewText = (
  locale: string,
  sourceQuestion: string,
  neighbors: FaqNeighbor[],
  variants: FaqQuestionVariants,
): string => {
  const lines = [
    `<b>${escapeHtml(i18n.t(locale, 'admin_faq_generated_questions_title'))}</b>`,
    '',
    `<b>${escapeHtml(i18n.t(locale, 'admin_faq_source_question_label'))}</b>`,
    escapeHtml(sourceQuestion),
    '',
    `<b>${escapeHtml(i18n.t(locale, 'admin_faq_similar_questions_label'))}</b>`,
  ];

  if (neighbors.length === 0) {
    lines.push(escapeHtml(i18n.t(locale, 'admin_faq_no_similar_questions')));
  } else {
    neighbors.forEach((neighbor, index) => {
      lines.push(`${index + 1}. <code>${neighbor.distance.toFixed(4)}</code>`);
      lines.push(`UZ: ${escapeHtml(neighbor.question_uz)}`);
      lines.push(`RU: ${escapeHtml(neighbor.question_ru)}`);
      lines.push(`EN: ${escapeHtml(neighbor.question_en)}`);
      lines.push('');
    });
  }

  lines.push(`<b>${escapeHtml(i18n.t(locale, 'admin_faq_generated_variants_label'))}</b>`);
  lines.push(`UZ: ${escapeHtml(variants.question_uz)}`);
  lines.push(`RU: ${escapeHtml(variants.question_ru)}`);
  lines.push(`EN: ${escapeHtml(variants.question_en)}`);

  return lines.join('\n');
};

const buildAnswerReviewText = (locale: string, answers: FaqAnswerVariants): string =>
  [
    `<b>${escapeHtml(i18n.t(locale, 'admin_faq_generated_answers_title'))}</b>`,
    '',
    `UZ:\n${escapeHtml(answers.answer_uz)}`,
    '',
    `RU:\n${escapeHtml(answers.answer_ru)}`,
    '',
    `EN:\n${escapeHtml(answers.answer_en)}`,
  ].join('\n');

const waitForTextInput = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  prompt: string,
  options?: { allowCancel?: boolean; lockDraft?: boolean },
): Promise<string | null> => {
  await ctx.reply(prompt, { reply_markup: getCancelKeyboard(locale) });

  while (true) {
    const nextCtx = await conversation.wait();
    const messageText = nextCtx.message?.text?.trim();
    const callbackData = nextCtx.callbackQuery?.data || '';

    if (nextCtx.callbackQuery) {
      await nextCtx.answerCallbackQuery().catch(() => undefined);

      if (options?.lockDraft && isBlockedExitCallback(callbackData)) {
        await nextCtx.reply(i18n.t(locale, 'admin_faq_finish_locked_draft'), {
          reply_markup: getCancelKeyboard(locale),
        });
      }
      continue;
    }

    if (!messageText) {
      continue;
    }

    if (options?.lockDraft && getBlockedExitTexts(locale).includes(messageText)) {
      await nextCtx.reply(i18n.t(locale, 'admin_faq_finish_locked_draft'), {
        reply_markup: getCancelKeyboard(locale),
      });
      continue;
    }

    if (options?.allowCancel && messageText === i18n.t(locale, 'admin_cancel')) {
      await nextCtx.reply(i18n.t(locale, 'admin_cancelled'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return null;
    }

    if (messageText === i18n.t(locale, 'admin_cancel')) {
      await nextCtx.reply(i18n.t(locale, 'admin_faq_finish_locked_draft'), {
        reply_markup: getCancelKeyboard(locale),
      });
      continue;
    }

    return messageText;
  }
};

const waitForCallbackChoice = async (
  conversation: BotConversation,
  locale: string,
  allowedCallbacks: string[],
): Promise<string> => {
  while (true) {
    const nextCtx = await conversation.wait();
    const callbackData = nextCtx.callbackQuery?.data || '';
    const messageText = nextCtx.message?.text?.trim();

    if (messageText && getBlockedExitTexts(locale).includes(messageText)) {
      await nextCtx.reply(i18n.t(locale, 'admin_faq_finish_locked_draft'), {
        reply_markup: getCancelKeyboard(locale),
      });
      continue;
    }

    if (!nextCtx.callbackQuery) {
      continue;
    }

    await nextCtx.answerCallbackQuery().catch(() => undefined);

    if (isBlockedExitCallback(callbackData)) {
      await nextCtx.reply(i18n.t(locale, 'admin_faq_finish_locked_draft'), {
        reply_markup: getCancelKeyboard(locale),
      });
      continue;
    }

    if (allowedCallbacks.includes(callbackData)) {
      return callbackData;
    }
  }
};

const collectManualAnswers = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
): Promise<FaqAnswerVariants | null> => {
  const answer_uz = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_manual_answer_uz_prompt'),
    { lockDraft: true },
  );
  if (!answer_uz) return null;

  const answer_ru = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_manual_answer_ru_prompt'),
    { lockDraft: true },
  );
  if (!answer_ru) return null;

  const answer_en = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_manual_answer_en_prompt'),
    { lockDraft: true },
  );
  if (!answer_en) return null;

  return { answer_uz, answer_ru, answer_en };
};

const collectEditedQuestionVariants = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  faq: FaqRecord,
): Promise<FaqQuestionVariants | null> => {
  await ctx.reply(
    [
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_edit_questions_intro'))}</b>`,
      '',
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_detail_question_uz'))}</b>`,
      escapeHtml(faq.question_uz),
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
  const question_uz = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_edit_prompt_question_uz'),
    { allowCancel: true },
  );
  if (!question_uz) return null;

  await ctx.reply(
    [
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_detail_question_ru'))}</b>`,
      escapeHtml(faq.question_ru),
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
  const question_ru = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_edit_prompt_question_ru'),
    { allowCancel: true },
  );
  if (!question_ru) return null;

  await ctx.reply(
    [
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_detail_question_en'))}</b>`,
      escapeHtml(faq.question_en),
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
  const question_en = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_edit_prompt_question_en'),
    { allowCancel: true },
  );
  if (!question_en) return null;

  return { question_uz, question_ru, question_en };
};

const collectEditedAnswerVariants = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  faq: FaqRecord,
): Promise<FaqAnswerVariants | null> => {
  await ctx.reply(
    [
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_edit_answers_intro'))}</b>`,
      '',
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_detail_answer_uz'))}</b>`,
      escapeHtml(faq.answer_uz),
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
  const answer_uz = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_edit_prompt_answer_uz'),
    { allowCancel: true },
  );
  if (!answer_uz) return null;

  await ctx.reply(
    [
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_detail_answer_ru'))}</b>`,
      escapeHtml(faq.answer_ru),
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
  const answer_ru = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_edit_prompt_answer_ru'),
    { allowCancel: true },
  );
  if (!answer_ru) return null;

  await ctx.reply(
    [
      `<b>${escapeHtml(i18n.t(locale, 'admin_faq_detail_answer_en'))}</b>`,
      escapeHtml(faq.answer_en),
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
  const answer_en = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_edit_prompt_answer_en'),
    { allowCancel: true },
  );
  if (!answer_en) return null;

  return { answer_uz, answer_ru, answer_en };
};

const saveAndPublishFaq = async (conversation: BotConversation, ctx: BotContext, locale: string, draft: FaqRecord) => {
  const adminId = ctx.from?.id;
  if (!adminId) {
    throw new Error('Admin id is missing');
  }

  const published = await conversation.external(() =>
    FaqService.publishFaq(draft.id, adminId),
  );
  if (!published) {
    throw new Error('Failed to publish FAQ draft');
  }

  clearFaqSession(ctx);
  await ctx.reply(i18n.t(locale, 'admin_faq_published'), {
    reply_markup: getAdminMenuKeyboard(locale),
  });
};

const hasDraftAnswers = (draft: FaqRecord): boolean =>
  Boolean(draft.answer_uz?.trim() && draft.answer_ru?.trim() && draft.answer_en?.trim());

const persistDraftAnswers = async (
  conversation: BotConversation,
  draft: FaqRecord,
  adminId: number,
  answers: FaqAnswerVariants,
): Promise<FaqRecord> => {
  const updatedDraft = await conversation.external(() =>
    FaqService.updateDraftAnswerVariants(draft.id, adminId, answers),
  );
  if (!updatedDraft) {
    throw new Error('Failed to update FAQ draft answers');
  }

  return updatedDraft;
};

const updateDraftAgentState = async (
  conversation: BotConversation,
  draft: FaqRecord,
  adminId: number,
  agentEnabled: boolean,
  agentToken: string | null,
): Promise<FaqRecord> => {
  const updatedDraft = await conversation.external(() =>
    FaqService.updateDraftAgentSettings(draft.id, adminId, {
      agentEnabled,
      agentToken,
    }),
  );

  if (!updatedDraft) {
    throw new Error('Failed to update FAQ agent settings');
  }

  return updatedDraft;
};

const runAgentMarkFlow = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  draft: FaqRecord,
) => {
  const adminId = ctx.from?.id;
  if (!adminId) {
    throw new Error('Admin id is missing');
  }

  const agentToken = buildAgentFaqToken(draft.id);
  getSession(ctx).adminFaqAgentToken = agentToken;

  const updatedWithAnswer = await persistDraftAnswers(conversation, draft, adminId, {
    answer_uz: agentToken,
    answer_ru: agentToken,
    answer_en: agentToken,
  });
  const updatedDraft = await updateDraftAgentState(
    conversation,
    updatedWithAnswer,
    adminId,
    true,
    agentToken,
  );

  await saveAndPublishFaq(conversation, ctx, locale, updatedDraft);
};

const runAnswerModeSelectionFlow = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  draft: FaqRecord,
) => {
  while (true) {
    await ctx.reply(i18n.t(locale, 'admin_faq_answer_mode_prompt'), {
      reply_markup: getAnswerModeKeyboard(locale),
    });

    const choice = await waitForCallbackChoice(conversation, locale, [
      FAQ_MODE_ANSWER_CALLBACK,
      FAQ_MODE_AGENT_CALLBACK,
    ]);

    if (choice === FAQ_MODE_ANSWER_CALLBACK) {
      await runAnswerFlow(conversation, ctx, locale, draft);
      return;
    }

    await runAgentMarkFlow(conversation, ctx, locale, draft);
    return;
  }
};

const runQuestionDraftFlow = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
): Promise<FaqRecord | null> => {
  const sourceQuestion = await waitForTextInput(
    conversation,
    ctx,
    locale,
    i18n.t(locale, 'admin_faq_question_prompt'),
    { allowCancel: true },
  );
  if (!sourceQuestion) {
    clearFaqSession(ctx);
    return null;
  }

  getSession(ctx).adminFaqSourceQuestion = sourceQuestion;

  while (true) {
    try {
      await ctx.reply(i18n.t(locale, 'admin_faq_processing_questions'));

      const queryEmbedding = await conversation.external(() =>
        FaqEmbeddingService.embedQuestionQuery(sourceQuestion),
      );
      const neighbors = await conversation.external(() =>
        FaqService.searchNearestPublishedFaqs(queryEmbedding, config.FAQ_SIMILAR_LIMIT),
      );
      const variants = await conversation.external(() =>
        FaqAiService.generateQuestionVariants({
          sourceQuestion,
          neighbors,
        }),
      );

      getSession(ctx).adminFaqQuestionVariants = variants;

      await ctx.reply(buildQuestionReviewText(locale, sourceQuestion, neighbors, variants), {
        parse_mode: 'HTML',
        reply_markup: getQuestionReviewKeyboard(locale),
      });

      const choice = await waitForCallbackChoice(conversation, locale, [
        FAQ_QUESTION_CONFIRM_CALLBACK,
        FAQ_QUESTION_REGENERATE_CALLBACK,
        FAQ_QUESTION_CANCEL_CALLBACK,
      ]);

      if (choice === FAQ_QUESTION_CANCEL_CALLBACK) {
        clearFaqSession(ctx);
        await ctx.reply(i18n.t(locale, 'admin_cancelled'), {
          reply_markup: getAdminMenuKeyboard(locale),
        });
        return null;
      }

      if (choice === FAQ_QUESTION_REGENERATE_CALLBACK) {
        continue;
      }

      const documentEmbedding = await conversation.external(() =>
        FaqEmbeddingService.embedFaqDocument(variants),
      );
      const draft = await conversation.external(() =>
        FaqService.createDraftFaq({
          ...variants,
          embedding: documentEmbedding,
          adminTelegramId: ctx.from!.id,
        }),
      );

      getSession(ctx).adminFaqDraftId = draft.id;
      await ctx.reply(i18n.t(locale, 'admin_faq_draft_created'));
      return draft;
    } catch (error) {
      logger.error('Error in FAQ question flow:', error);
      await ctx.reply(i18n.t(locale, 'admin_faq_generation_error'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      clearFaqSession(ctx);
      return null;
    }
  }
};

const runAnswerFlow = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  draft: FaqRecord,
) => {
  const questions: FaqQuestionVariants = {
    question_uz: draft.question_uz,
    question_ru: draft.question_ru,
    question_en: draft.question_en,
  };

  while (true) {
    const sourceAnswer = await waitForTextInput(
      conversation,
      ctx,
      locale,
      i18n.t(locale, 'admin_faq_answer_prompt'),
      { lockDraft: true },
    );
    if (!sourceAnswer) {
      continue;
    }

    let additionalInstructions = '';

    while (true) {
      try {
        await ctx.reply(i18n.t(locale, 'admin_faq_processing_answers'));

        const answers = await conversation.external(() =>
          FaqAiService.generateAnswerVariants({
            questions,
            sourceAnswer,
            additionalInstructions,
          }),
        );
        getSession(ctx).adminFaqAnswerVariants = answers;

        await ctx.reply(buildAnswerReviewText(locale, answers), {
          parse_mode: 'HTML',
          reply_markup: getAnswerReviewKeyboard(locale),
        });

        const choice = await waitForCallbackChoice(conversation, locale, [
          FAQ_ANSWER_CONFIRM_CALLBACK,
          FAQ_ANSWER_REJECT_CALLBACK,
        ]);

        if (choice === FAQ_ANSWER_CONFIRM_CALLBACK) {
          const updatedDraft = await persistDraftAnswers(conversation, draft, ctx.from!.id, answers);
          const standardDraft = await updateDraftAgentState(
            conversation,
            updatedDraft,
            ctx.from!.id,
            false,
            null,
          );
          await saveAndPublishFaq(conversation, ctx, locale, standardDraft);
          return;
        }

        await ctx.reply(i18n.t(locale, 'admin_faq_answer_rejected_prompt'), {
          reply_markup: getAnswerRejectedKeyboard(locale),
        });

        const rejectionChoice = await waitForCallbackChoice(conversation, locale, [
          FAQ_ANSWER_MANUAL_CALLBACK,
          FAQ_ANSWER_REGENERATE_CALLBACK,
        ]);

        if (rejectionChoice === FAQ_ANSWER_MANUAL_CALLBACK) {
          while (true) {
            const manualAnswers = await collectManualAnswers(conversation, ctx, locale);
            if (!manualAnswers) {
              continue;
            }

            await ctx.reply(buildAnswerReviewText(locale, manualAnswers), {
              parse_mode: 'HTML',
              reply_markup: getManualAnswerConfirmKeyboard(locale),
            });

            const manualChoice = await waitForCallbackChoice(conversation, locale, [
              FAQ_MANUAL_CONFIRM_CALLBACK,
              FAQ_MANUAL_REENTER_CALLBACK,
            ]);

            if (manualChoice === FAQ_MANUAL_REENTER_CALLBACK) {
              continue;
            }

            const updatedDraft = await persistDraftAnswers(conversation, draft, ctx.from!.id, manualAnswers);
            const standardDraft = await updateDraftAgentState(
              conversation,
              updatedDraft,
              ctx.from!.id,
              false,
              null,
            );
            await saveAndPublishFaq(conversation, ctx, locale, standardDraft);
            return;
          }
        }

        const instructions = await waitForTextInput(
          conversation,
          ctx,
          locale,
          i18n.t(locale, 'admin_faq_regeneration_instructions_prompt'),
          { lockDraft: true },
        );
        if (!instructions) {
          continue;
        }

        additionalInstructions = instructions;
        getSession(ctx).adminFaqAnswerRegenerationInstructions = instructions;
      } catch (error) {
        logger.error('Error in FAQ answer flow:', error);
        await ctx.reply(i18n.t(locale, 'admin_faq_generation_error'), {
          reply_markup: getCancelKeyboard(locale),
        });
      }
    }
  }
};

export async function adminFaqCreateConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const locale = await getLocale(conversation);

  try {
    let draft = await conversation.external(() => FaqService.getLockedDraftForAdmin(ctx.from!.id));

    if (draft) {
      getSession(ctx).adminFaqDraftId = draft.id;
      await ctx.reply(i18n.t(locale, 'admin_faq_resuming_draft'), {
        reply_markup: getCancelKeyboard(locale),
      });
    } else {
      draft = await runQuestionDraftFlow(conversation, ctx, locale);
      if (!draft) {
        return;
      }
    }

    if (hasDraftAnswers(draft)) {
      await saveAndPublishFaq(conversation, ctx, locale, draft);
      return;
    }

    await runAnswerModeSelectionFlow(conversation, ctx, locale, draft);
  } finally {
    clearFaqSession(ctx);
  }
}

const updatePublishedFaqQuestions = async (
  conversation: BotConversation,
  faqId: number,
  questions: FaqQuestionVariants,
): Promise<FaqRecord | null> => {
  const embedding = await conversation.external(() => FaqEmbeddingService.embedFaqDocument(questions));
  return conversation.external(() =>
    FaqService.updatePublishedQuestionVariants(faqId, questions, embedding),
  );
};

const completeFaqEditFlow = async (
  ctx: BotContext,
  locale: string,
  faqId: number,
  successText: string,
) => {
  await ctx.reply(successText, {
    reply_markup: getAdminMenuKeyboard(locale),
  });
  await showAdminFaqDetailCard(ctx, locale, faqId);
};

const runFaqAgentModeEditFlow = async (
  conversation: BotConversation,
  ctx: BotContext,
  locale: string,
  faq: FaqRecord,
) => {
  await ctx.reply(i18n.t(locale, 'admin_faq_agent_mode_confirm_prompt'), {
    reply_markup: getAgentModeConfirmKeyboard(locale),
  });

  const choice = await waitForCallbackChoice(conversation, locale, [
    FAQ_AGENT_CONFIRM_CALLBACK,
    FAQ_AGENT_CANCEL_CALLBACK,
  ]);

  if (choice === FAQ_AGENT_CANCEL_CALLBACK) {
    await ctx.reply(i18n.t(locale, 'admin_faq_edit_cancelled'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    await showAdminFaqDetailCard(ctx, locale, faq.id);
    return;
  }

  const agentToken = buildAgentFaqToken(faq.id);
  const answers: FaqAnswerVariants = {
    answer_uz: agentToken,
    answer_ru: agentToken,
    answer_en: agentToken,
  };

  const updatedWithAnswers = await conversation.external(() =>
    FaqService.updatePublishedAnswerVariants(faq.id, answers),
  );
  if (!updatedWithAnswers) {
    throw new Error('Failed to update FAQ answers for agent mode');
  }

  const updatedFaq = await conversation.external(() =>
    FaqService.updatePublishedAgentSettings(faq.id, {
      agentEnabled: true,
      agentToken,
    }),
  );

  if (!updatedFaq) {
    throw new Error('Failed to enable FAQ agent mode');
  }

  await completeFaqEditFlow(ctx, locale, faq.id, i18n.t(locale, 'admin_faq_agent_mode_updated'));
};

export async function adminFaqEditConversation(
  conversation: BotConversation,
  ctx: BotContext,
) {
  const session = await conversation.external((c) => c.session);
  const locale = session?.__language_code || 'uz';
  const target = session?.adminFaqEditTarget;

  if (!target) {
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
    return;
  }

  try {
    const faq = await conversation.external(() => FaqService.getPublishedFaqById(target.faqId));

    if (!faq) {
      await ctx.reply(i18n.t(locale, 'admin_faq_not_found'), {
        reply_markup: getAdminMenuKeyboard(locale),
      });
      return;
    }

    if (target.field === 'question_variants') {
      const questions = await collectEditedQuestionVariants(conversation, ctx, locale, faq);
      if (!questions) {
        return;
      }

      const updatedFaq = await updatePublishedFaqQuestions(conversation, faq.id, questions);
      if (!updatedFaq) {
        throw new Error('Failed to update published FAQ questions');
      }

      await completeFaqEditFlow(ctx, locale, faq.id, i18n.t(locale, 'admin_faq_questions_updated'));
      return;
    }

    if (target.field === 'answer_variants') {
      if (faq.agent_enabled) {
        await ctx.reply(i18n.t(locale, 'admin_faq_answer_edit_disables_agent_notice'));
      }

      const answers = await collectEditedAnswerVariants(conversation, ctx, locale, faq);
      if (!answers) {
        return;
      }

      const updatedFaq = await conversation.external(() =>
        FaqService.updatePublishedAnswerVariants(faq.id, answers),
      );
      if (!updatedFaq) {
        throw new Error('Failed to update published FAQ answers');
      }

      await completeFaqEditFlow(ctx, locale, faq.id, i18n.t(locale, 'admin_faq_answers_updated'));
      return;
    }

    if (target.field === 'agent_mode') {
      await runFaqAgentModeEditFlow(conversation, ctx, locale, faq);
      return;
    }

    throw new Error(`Unsupported FAQ edit target: ${(target as { field?: FaqEditableField }).field}`);
  } catch (error) {
    logger.error('Error in FAQ edit flow:', error);
    await ctx.reply(i18n.t(locale, 'admin_error'), {
      reply_markup: getAdminMenuKeyboard(locale),
    });
  } finally {
    await conversation.external((c) => {
      if (c.session) {
        c.session.adminFaqEditTarget = undefined;
      }
    });
  }
}
