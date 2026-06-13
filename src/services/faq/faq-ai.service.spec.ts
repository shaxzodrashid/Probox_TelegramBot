import test from 'node:test';
import assert from 'node:assert/strict';

import { FaqAiService } from './faq-ai.service';
import { GeminiService } from '../gemini.service';
import { FaqRecord } from '../../types/faq.types';
import { config } from '../../config';

const makeFaq = (id: number): FaqRecord => ({
  id,
  question_uz: 'Savol',
  question_ru: 'Вопрос',
  question_en: 'Question',
  answer_uz: 'Javob',
  answer_ru: 'Ответ',
  answer_en: 'Answer',
  status: 'published',
  vector_embedding: '[]',
  agent_enabled: true,
  agent_token: null,
  created_by_admin_telegram_id: 1,
  locked_by_admin_telegram_id: null,
  workflow_stage: 'completed',
  created_at: new Date(),
  updated_at: new Date(),
});

test('generateQuestionVariants creates an intent-aware retrieval profile with the dedicated authoring model', async () => {
  const originalGenerateJson = GeminiService.generateJson;
  let capturedParams: Parameters<typeof GeminiService.generateJson>[0] | undefined;

  GeminiService.generateJson = (async (params) => {
    capturedParams = params;
    return {
      question_uz: 'Salomlashish',
      question_ru: 'Приветствие',
      question_en: 'Greeting',
      intent_description: 'Match standalone greetings used to start a conversation with the bot.',
      utterances_uz: ['Assalomu alaykum', 'Salom', 'Salomlar'],
      utterances_ru: ['Здравствуйте', 'Привет', 'Добрый день'],
      utterances_en: ['Hello', 'Hi', 'Good morning'],
    };
  }) as typeof GeminiService.generateJson;

  try {
    const result = await FaqAiService.generateQuestionVariants({
      sourceQuestion: 'Salomlashish, masalan "Assalomu alaykum". Store greetings as quick FAQ.',
      neighbors: [],
    });

    assert.equal(capturedParams?.model, config.GEMINI_FAQ_AUTHORING_MODEL);
    assert.equal(capturedParams?.schemaName, 'FAQ retrieval profile');
    assert.ok(capturedParams?.systemInstruction);
    assert.match(String(capturedParams?.systemInstruction), /Never convert a non-question intent/);
    assert.deepEqual(result.retrieval_profile.utterances_uz, [
      'Assalomu alaykum',
      'Salom',
      'Salomlar',
    ]);
    assert.equal(result.question_en, 'Greeting');
  } finally {
    GeminiService.generateJson = originalGenerateJson;
  }
});

test('chooseSupportFaqCandidate returns null when there are no agent-enabled candidates', async () => {
  const result = await FaqAiService.chooseSupportFaqCandidate({
    userMessage: 'Sizlarda yetkazib berish xizmati bormi?',
    candidates: [
      {
        faq: {
          ...makeFaq(9),
          agent_enabled: false,
        },
        distance: 0.17,
        routingScore: 0.74,
        matchedConcepts: ['shipping'],
      },
    ],
  });

  assert.equal(result, null);
});

test('chooseSupportFaqCandidate coerces numeric string faq id from model output', async () => {
  const originalGenerateJson = GeminiService.generateJson;

  GeminiService.generateJson = (async () =>
    ({
      should_auto_reply: true,
      matched_faq_id: '2',
      confidence: 0.95,
      reason: 'FAQ ID 2 directly answers the question.',
    })) as typeof GeminiService.generateJson;

  try {
    const result = await FaqAiService.chooseSupportFaqCandidate({
      userMessage: 'Samarqandda filial bormi?',
      candidates: [
        { faq: makeFaq(2), distance: 0.16, routingScore: 0.82, matchedConcepts: ['branch'] },
      ],
    });

    assert.equal(result?.shouldAutoReply, true);
    assert.equal(result?.matchedFaqId, 2);
  } finally {
    GeminiService.generateJson = originalGenerateJson;
  }
});

test('chooseSupportFaqCandidate recovers faq id from reason when model omits matched_faq_id', async () => {
  const originalGenerateJson = GeminiService.generateJson;

  GeminiService.generateJson = (async () =>
    ({
      should_auto_reply: true,
      matched_faq_id: null,
      confidence: 0.95,
      reason: 'FAQ ID 2 directly answers the user message.',
    })) as typeof GeminiService.generateJson;

  try {
    const result = await FaqAiService.chooseSupportFaqCandidate({
      userMessage: 'Samarqandda filial bormi?',
      candidates: [
        { faq: makeFaq(2), distance: 0.16, routingScore: 0.82, matchedConcepts: ['branch'] },
      ],
    });

    assert.equal(result?.shouldAutoReply, true);
    assert.equal(result?.matchedFaqId, 2);
  } finally {
    GeminiService.generateJson = originalGenerateJson;
  }
});
