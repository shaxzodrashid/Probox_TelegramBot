import test from 'node:test';
import assert from 'node:assert/strict';

import { FaqCandidateRecord } from '../../services/faq/faq.service';
import { FaqRecord } from '../../types/faq.types';
import {
  FAQ_ROUTING_MIN_MARGIN,
  FAQ_ROUTING_MIN_SCORE,
  FAQ_STATIC_ROUTING_MIN_SCORE,
  rankFaqCandidatesForRouting,
} from './faq-routing-score.util';

const makeFaq = (
  id: number,
  question: string,
  answer: string,
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
  agent_enabled: false,
  agent_token: null,
  created_by_admin_telegram_id: 1,
  locked_by_admin_telegram_id: null,
  workflow_stage: 'completed',
  created_at: new Date(),
  updated_at: new Date(),
});

test('rankFaqCandidatesForRouting prefers current region coverage FAQ for Samarkand branch query', () => {
  const candidates: FaqCandidateRecord[] = [
    {
      faq: makeFaq(
        2,
        "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
        "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
      ),
      distance: 0.1688,
    },
    {
      faq: makeFaq(
        3,
        'Kelajakda viloyatlarda ham alohida ofislar ochish rejangiz bormi?',
        'Kelajak rejalari haqida alohida xabar beramiz.',
      ),
      distance: 0.2228,
    },
    {
      faq: makeFaq(
        4,
        "Mahsulotlaringizni O'zbekistonning boshqa shaharlariga jo'natib bera olasizmi?",
        "Ha, yetkazib berish xizmati mavjud.",
      ),
      distance: 0.2344,
    },
  ];

  const ranked = rankFaqCandidatesForRouting(
    'Samarqand viloyatida ham xizmat ko‘rsatish shaxobchangiz bormi?',
    candidates,
    0.35,
  );

  assert.equal(ranked[0]?.faq.id, 2);
  assert.ok((ranked[0]?.routingScore || 0) >= FAQ_ROUTING_MIN_SCORE);
  assert.ok(((ranked[0]?.routingScore || 0) - (ranked[1]?.routingScore || 0)) >= FAQ_ROUTING_MIN_MARGIN);
});

test('rankFaqCandidatesForRouting keeps a shipping FAQ viable for transliterated delivery slang', () => {
  const candidates: FaqCandidateRecord[] = [
    {
      faq: makeFaq(
        4,
        "Mahsulotlaringizni O'zbekistonning boshqa shaharlariga jo'natib bera olasizmi?",
        'Ha, yetkazib berish xizmati mavjud.',
      ),
      distance: 0.3322,
    },
    {
      faq: makeFaq(
        2,
        "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
        "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
      ),
      distance: 0.3779,
    },
  ];

  const ranked = rankFaqCandidatesForRouting(
    'silada dostavka bomi',
    candidates,
    0.4,
  );

  assert.equal(ranked[0]?.faq.id, 4);
  assert.ok((ranked[0]?.routingScore || 0) >= FAQ_STATIC_ROUTING_MIN_SCORE);
});

test('rankFaqCandidatesForRouting no longer over-penalizes branch count questions that also include bor', () => {
  const candidates: FaqCandidateRecord[] = [
    {
      faq: makeFaq(
        1,
        "Probox kompaniyasining umumiy filiallari soni qancha?",
        'Hozirda kompaniyamizning umumiy filiallari soni maʼlum tartibda ko‘rsatiladi.',
      ),
      distance: 0.3695,
    },
    {
      faq: makeFaq(
        2,
        "Respublika bo'ylab boshqa hududlarda ham xizmat ko'rsatish shoxobchalaringiz joylashganmi?",
        "Hozircha faqat Toshkent shahrida filiallarimiz mavjud.",
      ),
      distance: 0.3703,
    },
  ];

  const ranked = rankFaqCandidatesForRouting(
    'Silada nechta filial bor',
    candidates,
    0.4,
  );

  assert.equal(ranked[0]?.faq.id, 1);
  assert.ok((ranked[0]?.routingScore || 0) >= FAQ_STATIC_ROUTING_MIN_SCORE);
});
