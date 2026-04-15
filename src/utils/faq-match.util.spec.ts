import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getFaqAnswerForLanguage,
  isFaqSemanticDistanceAccepted,
  isExactFaqQuestionMatch,
  normalizeFaqQuestion,
} from './faq-match.util';

test('normalizeFaqQuestion collapses whitespace and normalizes quote variants', () => {
  assert.equal(
    normalizeFaqQuestion('  To‘lov   qanday   qilinadi?  '),
    "to'lov qanday qilinadi?",
  );
  assert.equal(
    normalizeFaqQuestion('“Оплата” qanday bo‘ladi?'),
    "\"оплата\" qanday bo'ladi?",
  );
});

test('isExactFaqQuestionMatch compares against all FAQ language variants', () => {
  assert.equal(
    isExactFaqQuestionMatch(
      {
        question_uz: "To'lov qanday qilinadi?",
        question_ru: 'Как оплатить?',
        question_en: 'How do I pay?',
      },
      '  как оплатить? ',
    ),
    true,
  );
});

test('getFaqAnswerForLanguage returns the requested locale with fallbacks', () => {
  assert.equal(
    getFaqAnswerForLanguage(
      {
        answer_uz: 'Uzbek answer',
        answer_ru: 'Russian answer',
        answer_en: 'English answer',
      },
      'ru',
    ),
    'Russian answer',
  );

  assert.equal(
    getFaqAnswerForLanguage(
      {
        answer_uz: 'Uzbek answer',
        answer_ru: '',
        answer_en: 'English answer',
      },
      'ru',
    ),
    'Uzbek answer',
  );
});

test('isFaqSemanticDistanceAccepted respects the configured threshold', () => {
  assert.equal(isFaqSemanticDistanceAccepted(0.24, 0.3), true);
  assert.equal(isFaqSemanticDistanceAccepted(0.41, 0.3), false);
});
