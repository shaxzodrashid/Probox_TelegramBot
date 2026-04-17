import test from 'node:test';
import assert from 'node:assert/strict';

import { FaqAiService } from './faq-ai.service';
import { GeminiService } from '../gemini.service';
import { FaqRecord } from '../../types/faq.types';

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
