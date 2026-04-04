import { config } from '../config';
import { FaqQuestionVariants } from '../types/faq.types';
import { GeminiService } from './gemini.service';

export class FaqEmbeddingService {
  static buildDocumentText(questions: FaqQuestionVariants): string {
    return [
      `uz: ${questions.question_uz}`,
      `ru: ${questions.question_ru}`,
      `en: ${questions.question_en}`,
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

  static async embedFaqDocument(questions: FaqQuestionVariants): Promise<number[]> {
    const embedding = await GeminiService.embedText({
      text: this.buildDocumentText(questions),
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: config.FAQ_EMBEDDING_DIM,
    });

    return this.normalize(embedding);
  }
}
