import test from 'node:test';
import assert from 'node:assert/strict';

import { FaqEmbeddingService } from './faq-embedding.service';
import { FaqService } from './faq.service';
import { FaqNeighbor, FaqRecord } from '../../types/faq.types';

const makeFaqWithRuntimeStringId = (id: string): FaqRecord =>
  ({
    id,
    question_uz: "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
    question_ru: 'Есть ли филиалы в других регионах республики?',
    question_en: 'Do you have branches in other regions of the country?',
    answer_uz: 'Ha, boshqa hududlarda ham xizmat ko‘rsatamiz.',
    answer_ru: 'Да, мы также работаем в других регионах.',
    answer_en: 'Yes, we also serve other regions.',
    status: 'published',
    vector_embedding: '[]',
    agent_enabled: false,
    agent_token: null,
    created_by_admin_telegram_id: '1',
    locked_by_admin_telegram_id: null,
    workflow_stage: 'completed',
    created_at: new Date(),
    updated_at: new Date(),
  }) as unknown as FaqRecord;

test('findSemanticFaqCandidatesByQuestion preserves candidates when database returns bigint ids as strings', async () => {
  const originalEmbedQuestionQuery = FaqEmbeddingService.embedQuestionQuery;
  const originalSearchNearestPublishedFaqs = FaqService.searchNearestPublishedFaqs;
  const originalGetPublishedFaqsByIds = FaqService.getPublishedFaqsByIds;

  FaqEmbeddingService.embedQuestionQuery = async () => [0.1, 0.2, 0.3];
  FaqService.searchNearestPublishedFaqs = async (): Promise<FaqNeighbor[]> => [
    {
      id: 2,
      question_uz: 'Samarqandda filiallar bormi?',
      question_ru: 'Есть ли филиалы в Самарканде?',
      question_en: 'Do you have branches in Samarkand?',
      distance: 0.19,
    },
  ];
  FaqService.getPublishedFaqsByIds = async () => [makeFaqWithRuntimeStringId('2')];

  try {
    const candidates = await FaqService.findSemanticFaqCandidatesByQuestion(
      'Samarqandda filiallar bormi?',
    );

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.faq.id, 2);
    assert.equal(candidates[0]?.distance, 0.19);
  } finally {
    FaqEmbeddingService.embedQuestionQuery = originalEmbedQuestionQuery;
    FaqService.searchNearestPublishedFaqs = originalSearchNearestPublishedFaqs;
    FaqService.getPublishedFaqsByIds = originalGetPublishedFaqsByIds;
  }
});
