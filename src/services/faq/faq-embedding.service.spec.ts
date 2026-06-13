import test from 'node:test';
import assert from 'node:assert/strict';

import { FaqEmbeddingService } from './faq-embedding.service';

test('buildDocumentText includes the intent and realistic trigger utterances', () => {
  const text = FaqEmbeddingService.buildDocumentText({
    question_uz: 'Salomlashish',
    question_ru: 'Приветствие',
    question_en: 'Greeting',
    retrieval_profile: {
      intent_description: 'Match standalone greetings used to start a conversation with the bot.',
      utterances_uz: ['Assalomu alaykum', 'Salom'],
      utterances_ru: ['Здравствуйте', 'Привет'],
      utterances_en: ['Hello', 'Hi'],
    },
  });

  assert.match(text, /Intent: Match standalone greetings/);
  assert.match(text, /uz: Assalomu alaykum/);
  assert.match(text, /ru: Привет/);
  assert.match(text, /en: Hi/);
  assert.doesNotMatch(text, /How should I greet the bot/);
});

test('buildFallbackRetrievalProfile splits manually entered aliases', () => {
  const profile = FaqEmbeddingService.buildFallbackRetrievalProfile({
    question_uz: 'Assalomu alaykum; Salom; Salomlar',
    question_ru: 'Здравствуйте; Привет',
    question_en: 'Hello; Hi',
  });

  assert.deepEqual(profile.utterances_uz, ['Assalomu alaykum', 'Salom', 'Salomlar']);
});
