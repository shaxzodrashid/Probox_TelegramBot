import { config } from '../../config';
import {
  FaqAuthoringResult,
  FaqQuestionVariants,
  FaqRetrievalProfile,
} from '../../types/faq.types';
import { GeminiService } from '../gemini.service';

export class FaqEmbeddingService {
  private static splitFallbackUtterances(value: string): string[] {
    const parts = value
      .split(/[;\n|]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    return parts.length > 0 ? parts : [value.trim()].filter(Boolean);
  }

  static buildFallbackRetrievalProfile(questions: FaqQuestionVariants): FaqRetrievalProfile {
    return {
      intent_description: [
        questions.question_uz,
        questions.question_ru,
        questions.question_en,
      ].join(' / '),
      utterances_uz: this.splitFallbackUtterances(questions.question_uz),
      utterances_ru: this.splitFallbackUtterances(questions.question_ru),
      utterances_en: this.splitFallbackUtterances(questions.question_en),
    };
  }

  static getRetrievalProfile(
    questions: FaqQuestionVariants | FaqAuthoringResult,
  ): FaqRetrievalProfile {
    const profile = (questions as FaqAuthoringResult).retrieval_profile;
    return profile || this.buildFallbackRetrievalProfile(questions);
  }

  static buildDocumentText(questions: FaqQuestionVariants | FaqAuthoringResult): string {
    const profile = this.getRetrievalProfile(questions);

    return [
      'FAQ retrieval document',
      `Intent: ${profile.intent_description}`,
      '',
      'Admin labels:',
      `uz: ${questions.question_uz}`,
      `ru: ${questions.question_ru}`,
      `en: ${questions.question_en}`,
      '',
      'Positive user utterances that should trigger this FAQ:',
      ...profile.utterances_uz.map((utterance) => `uz: ${utterance}`),
      ...profile.utterances_ru.map((utterance) => `ru: ${utterance}`),
      ...profile.utterances_en.map((utterance) => `en: ${utterance}`),
    ].join('\n');
  }

  static normalize(values: number[]): number[] {
    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    if (!magnitude) {
      throw new Error('Cannot normalize a zero-length embedding vector');
    }

    return values.map((value) => value / magnitude);
  }

  static async embedQuestionQuery(text: string): Promise<number[]> {
    const embedding = await GeminiService.embedText({
      text,
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: config.FAQ_EMBEDDING_DIM,
    });

    return this.normalize(embedding);
  }

  static async embedFaqDocument(
    questions: FaqQuestionVariants | FaqAuthoringResult,
  ): Promise<number[]> {
    const embedding = await GeminiService.embedText({
      text: this.buildDocumentText(questions),
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: config.FAQ_EMBEDDING_DIM,
    });

    return this.normalize(embedding);
  }
}
