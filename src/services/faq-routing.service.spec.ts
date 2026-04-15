import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../config';
import { FaqAiService } from './faq-ai.service';
import { FaqRoutingService } from './faq-routing.service';
import { FaqCandidateRecord, FaqService } from './faq.service';
import { FaqRecord } from '../types/faq.types';

const makeFaq = (id: number, question: string, answer: string): FaqRecord => ({
  id,
  question_uz: question,
  question_ru: `${question} ru`,
  question_en: `${question} en`,
  answer_uz: answer,
  answer_ru: `${answer} ru`,
  answer_en: `${answer} en`,
  status: 'published',
  vector_embedding: '[]',
  agent_enabled: false,
  agent_token: null,
  created_by_admin_telegram_id: 1,
  locked_by_admin_telegram_id: null,
  workflow_stage: 'completed',
  created_at: new Date(),
  updated_at: new Date(),
});

test('resolveSupportFaq returns exact FAQ immediately', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;

  const exactFaq = makeFaq(10, 'Yetkazib berasizmi?', 'Ha, yetkazib beramiz.');

  FaqService.findExactPublishedFaqByQuestion = async () => exactFaq;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => {
    throw new Error('semantic lookup should not run for exact match');
  };

  try {
    const result = await FaqRoutingService.resolveSupportFaq('Yetkazib berasizmi?');
    assert.equal(result?.resolutionType, 'exact');
    assert.equal(result?.faq.id, 10);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
  }
});

test('resolveSupportFaq accepts AI-confirmed semantic candidate', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;
  const originalMinConfidence = config.FAQ_AUTO_REPLY_MIN_CONFIDENCE;

  const faq = makeFaq(22, 'Nasiya shartlari qanday?', '24 oygacha muddat bor.');
  const candidates: FaqCandidateRecord[] = [{ faq, distance: 0.18 }];

  FaqService.findExactPublishedFaqByQuestion = async () => null;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => candidates;
  FaqAiService.chooseSupportFaqCandidate = async () => ({
    shouldAutoReply: true,
    matchedFaqId: 22,
    confidence: 0.93,
    reason: 'The FAQ directly answers the financing terms question.',
  });
  config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = true;
  config.FAQ_AUTO_REPLY_MIN_CONFIDENCE = 0.85;

  try {
    const result = await FaqRoutingService.resolveSupportFaq('Nasiya necha oyga beriladi?');
    assert.equal(result?.resolutionType, 'semantic_ai');
    assert.equal(result?.faq.id, 22);
    assert.equal(result?.distance, 0.18);
    assert.equal(result?.confidence, 0.93);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
    FaqAiService.chooseSupportFaqCandidate = originalChooseCandidate;
    config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = originalSemanticEnabled;
    config.FAQ_AUTO_REPLY_MIN_CONFIDENCE = originalMinConfidence;
  }
});

test('resolveSupportFaq falls back to human when AI confidence is too low', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;
  const originalMinConfidence = config.FAQ_AUTO_REPLY_MIN_CONFIDENCE;

  const faq = makeFaq(31, 'Kredit uchun nimalar kerak?', 'Pasport va telefon raqami kerak.');

  FaqService.findExactPublishedFaqByQuestion = async () => null;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => [{ faq, distance: 0.11 }];
  FaqAiService.chooseSupportFaqCandidate = async () => ({
    shouldAutoReply: true,
    matchedFaqId: 31,
    confidence: 0.62,
    reason: 'Possible match but not certain.',
  });
  config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = true;
  config.FAQ_AUTO_REPLY_MIN_CONFIDENCE = 0.85;

  try {
    const result = await FaqRoutingService.resolveSupportFaq('Menga qaysi hujjatlar kerak va onlayn topshirsam bo‘ladimi?');
    assert.equal(result, null);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
    FaqAiService.chooseSupportFaqCandidate = originalChooseCandidate;
    config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = originalSemanticEnabled;
    config.FAQ_AUTO_REPLY_MIN_CONFIDENCE = originalMinConfidence;
  }
});
