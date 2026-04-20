import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../config';
import { FaqAiService } from './faq-ai.service';
import { FaqRoutingService } from './faq-routing.service';
import { FaqCandidateRecord, FaqService } from './faq.service';
import { FaqRecord } from '../../types/faq.types';

const makeFaq = (
  id: number,
  question: string,
  answer: string,
  options: {
    agentEnabled?: boolean;
    agentToken?: string | null;
  } = {},
): FaqRecord => ({
  id,
  question_uz: question,
  question_ru: `${question} ru`,
  question_en: `${question} en`,
  answer_uz: answer,
  answer_ru: `${answer} ru`,
  answer_en: `${answer} en`,
  status: 'published',
  vector_embedding: '[]',
  agent_enabled: options.agentEnabled === true,
  agent_token: options.agentToken ?? null,
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

test('resolveSupportFaq accepts strong static semantic candidate without agent gating', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;

  const shippingFaq = makeFaq(
    14,
    "Mahsulotlaringizni O'zbekistonning boshqa shaharlariga jo'natib bera olasizmi?",
    'Ha, yetkazib berish xizmati mavjud.',
  );
  const branchFaq = makeFaq(
    2,
    "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
    "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
  );

  FaqService.findExactPublishedFaqByQuestion = async () => null;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => [
    { faq: shippingFaq, distance: 0.1673 },
    { faq: branchFaq, distance: 0.2286 },
  ];
  FaqAiService.chooseSupportFaqCandidate = async () => {
    throw new Error('Agent-only Gemini routing should not run for a strong static semantic FAQ match');
  };
  config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = true;

  try {
    const result = await FaqRoutingService.resolveSupportFaq('Sizlarda yetkazib berish xizmati ham bormi ?');
    assert.equal(result?.resolutionType, 'semantic');
    assert.equal(result?.faq.id, 14);
    assert.equal(result?.distance, 0.1673);
    assert.equal(result?.confidence, 1);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
    FaqAiService.chooseSupportFaqCandidate = originalChooseCandidate;
    config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = originalSemanticEnabled;
  }
});

test('resolveSupportFaq accepts AI-confirmed semantic candidate', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;
  const originalMinConfidence = config.FAQ_AUTO_REPLY_MIN_CONFIDENCE;

  const faq = makeFaq(22, 'Nasiya shartlari qanday?', '__AGENT_FAQ_22__', {
    agentEnabled: true,
    agentToken: '__AGENT_FAQ_22__',
  });
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

  const faq = makeFaq(31, 'Kredit uchun nimalar kerak?', '__AGENT_FAQ_31__', {
    agentEnabled: true,
    agentToken: '__AGENT_FAQ_31__',
  });

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

test('resolveSupportFaq accepts colloquial branch coverage query as a static semantic FAQ', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;

  const coverageFaq = makeFaq(
    2,
    "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
    "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
  );
  const futurePlanFaq = makeFaq(
    3,
    'Kelajakda viloyatlarda ham alohida ofislar ochish rejangiz bormi?',
    'Kelajak rejalari haqida alohida xabar beramiz.',
  );
  const shippingFaq = makeFaq(
    4,
    "Mahsulotlaringizni O'zbekistonning boshqa shaharlariga jo'natib bera olasizmi?",
    'Ha, yetkazib berish xizmati mavjud.',
  );

  FaqService.findExactPublishedFaqByQuestion = async () => null;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => [
    { faq: coverageFaq, distance: 0.2362 },
    { faq: futurePlanFaq, distance: 0.2602 },
    { faq: shippingFaq, distance: 0.2989 },
  ];
  FaqAiService.chooseSupportFaqCandidate = async () => {
    throw new Error('Agent-only Gemini routing should not run for a strong static branch coverage match');
  };
  config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = true;

  try {
    const result = await FaqRoutingService.resolveSupportFaq('silada viloyatladayam filialaring bormi');
    assert.equal(result?.resolutionType, 'semantic');
    assert.equal(result?.faq.id, 2);
    assert.equal(result?.confidence, 1);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
    FaqAiService.chooseSupportFaqCandidate = originalChooseCandidate;
    config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = originalSemanticEnabled;
  }
});

test('resolveSupportFaq accepts paraphrased branch count query as a static semantic FAQ', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;

  const branchCountFaq = makeFaq(
    1,
    "Probox kompaniyasining umumiy filiallari soni qancha?",
    "Hozirda kompaniyamizning umumiy filiallari soni maʼlum tartibda ko‘rsatiladi.",
  );
  const branchCoverageFaq = makeFaq(
    2,
    "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
    "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
  );
  const futurePlanFaq = makeFaq(
    3,
    'Kelajakda viloyatlarda ham alohida ofislar ochish rejangiz bormi?',
    'Kelajak rejalari haqida alohida xabar beramiz.',
  );

  FaqService.findExactPublishedFaqByQuestion = async () => null;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => [
    { faq: branchCountFaq, distance: 0.2254 },
    { faq: branchCoverageFaq, distance: 0.1589 },
    { faq: futurePlanFaq, distance: 0.2025 },
  ];
  FaqAiService.chooseSupportFaqCandidate = async () => {
    throw new Error('Agent-only Gemini routing should not run for a clear static branch count FAQ match');
  };
  config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = true;

  try {
    const result = await FaqRoutingService.resolveSupportFaq(
      'Assalomu alaykum, sizlarda nechta filial bor',
    );
    assert.equal(result?.resolutionType, 'semantic');
    assert.equal(result?.faq.id, 1);
    assert.equal(result?.distance, 0.2254);
    assert.equal(result?.confidence, 1);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
    FaqAiService.chooseSupportFaqCandidate = originalChooseCandidate;
    config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = originalSemanticEnabled;
  }
});

test('resolveSupportFaq deterministically routes stock-check questions to the dedicated agent FAQ', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;

  const stockFaq = makeFaq(
    7,
    "Sotuvda aynan qaysi turdagi telefonlar yoki modellar mavjudligini qanday bilsam bo'ladi?",
    '__AGENT_FAQ_7__',
    {
      agentEnabled: true,
      agentToken: '__AGENT_FAQ_7__',
    },
  );
  const branchFaq = makeFaq(
    2,
    "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
    "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
  );

  FaqService.findExactPublishedFaqByQuestion = async () => null;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => [
    { faq: stockFaq, distance: 0.2605 },
    { faq: branchFaq, distance: 0.3318 },
  ];
  FaqAiService.chooseSupportFaqCandidate = async () => {
    throw new Error('Gemini routing should not run when a single stock-check agent FAQ candidate is available');
  };
  config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = true;

  try {
    const result = await FaqRoutingService.resolveSupportFaq('Silada iPhone 17 Pro modeli bormi ?');
    assert.equal(result?.resolutionType, 'semantic_ai');
    assert.equal(result?.faq.id, 7);
    assert.equal(result?.confidence, 1);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
    FaqAiService.chooseSupportFaqCandidate = originalChooseCandidate;
    config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = originalSemanticEnabled;
  }
});

test('resolveSupportFaq accepts a high-confidence static FAQ when no agent candidate applies', async () => {
  const originalFindExact = FaqService.findExactPublishedFaqByQuestion;
  const originalFindCandidates = FaqService.findSemanticFaqCandidatesByQuestion;
  const originalChooseCandidate = FaqAiService.chooseSupportFaqCandidate;
  const originalSemanticEnabled = config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED;

  const branchCountFaq = makeFaq(
    1,
    "Probox kompaniyasining umumiy filiallari soni qancha?",
    'Bizning filiallarimiz haqida maʼlumot shu yerda.',
  );
  const branchCoverageFaq = makeFaq(
    2,
    "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
    "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
  );

  FaqService.findExactPublishedFaqByQuestion = async () => null;
  FaqService.findSemanticFaqCandidatesByQuestion = async () => [
    { faq: branchCountFaq, distance: 0.2101 },
    { faq: branchCoverageFaq, distance: 0.2628 },
  ];
  FaqAiService.chooseSupportFaqCandidate = async () => {
    throw new Error('Agent-only Gemini routing should not run when a high-confidence static FAQ is enough');
  };
  config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = true;

  try {
    const result = await FaqRoutingService.resolveSupportFaq('Filiallar qatta ozi');
    assert.equal(result?.resolutionType, 'semantic');
    assert.equal(result?.faq.id, 1);
    assert.equal(result?.confidence, 1);
  } finally {
    FaqService.findExactPublishedFaqByQuestion = originalFindExact;
    FaqService.findSemanticFaqCandidatesByQuestion = originalFindCandidates;
    FaqAiService.chooseSupportFaqCandidate = originalChooseCandidate;
    config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED = originalSemanticEnabled;
  }
});
