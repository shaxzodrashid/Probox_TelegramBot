import { FaqAnswerVariants, FaqNeighbor, FaqQuestionVariants } from '../types/faq.types';
import { GeminiService } from './gemini.service';

interface QuestionVariantsPayload {
  question_uz?: string;
  question_ru?: string;
  question_en?: string;
}

interface AnswerVariantsPayload {
  answer_uz?: string;
  answer_ru?: string;
  answer_en?: string;
}

const formatNeighbors = (neighbors: FaqNeighbor[]): string => {
  if (neighbors.length === 0) {
    return 'No similar published FAQs were found.';
  }

  return neighbors
    .map((neighbor, index) => {
      return [
        `${index + 1}. distance=${neighbor.distance.toFixed(6)}`,
        `uz: ${neighbor.question_uz}`,
        `ru: ${neighbor.question_ru}`,
        `en: ${neighbor.question_en}`,
      ].join('\n');
    })
    .join('\n\n');
};

const assertQuestionVariants = (payload: QuestionVariantsPayload): FaqQuestionVariants => {
  const question_uz = payload.question_uz?.trim();
  const question_ru = payload.question_ru?.trim();
  const question_en = payload.question_en?.trim();

  if (!question_uz || !question_ru || !question_en) {
    throw new Error('Gemini returned incomplete question variants');
  }

  return {
    question_uz,
    question_ru,
    question_en,
  };
};

const assertAnswerVariants = (payload: AnswerVariantsPayload): FaqAnswerVariants => {
  const answer_uz = payload.answer_uz?.trim();
  const answer_ru = payload.answer_ru?.trim();
  const answer_en = payload.answer_en?.trim();

  if (!answer_uz || !answer_ru || !answer_en) {
    throw new Error('Gemini returned incomplete answer variants');
  }

  return {
    answer_uz,
    answer_ru,
    answer_en,
  };
};

export class FaqAiService {
  static async generateQuestionVariants(params: {
    sourceQuestion: string;
    neighbors: FaqNeighbor[];
  }): Promise<FaqQuestionVariants> {
    const prompt = [
      'You are generating multilingual FAQ question variants for a Telegram bot admin panel.',
      'Return valid JSON with exactly these keys: question_uz, question_ru, question_en.',
      'The output questions must preserve the same user intent as the source question.',
      'Write natural FAQ-style phrasing in Uzbek, Russian, and English.',
      'Keep the meaning aligned across languages.',
      'Make the wording noticeably different from the nearby FAQ neighbors so the new FAQ is not too close to them in embedding space.',
      'Do not answer the question. Do not add extra keys or commentary.',
      '',
      `Source question:\n${params.sourceQuestion}`,
      '',
      `Nearest published FAQ neighbors:\n${formatNeighbors(params.neighbors)}`,
    ].join('\n');

    const payload = await GeminiService.generateJson<QuestionVariantsPayload>({
      prompt,
      schemaName: 'faq question variants',
    });

    return assertQuestionVariants(payload);
  }

  static async generateAnswerVariants(params: {
    questions: FaqQuestionVariants;
    sourceAnswer: string;
    additionalInstructions?: string;
  }): Promise<FaqAnswerVariants> {
    const prompt = [
      'You are rewriting an FAQ answer for a Telegram bot knowledge base.',
      'Return valid JSON with exactly these keys: answer_uz, answer_ru, answer_en.',
      'Use the confirmed FAQ questions as the intent anchor.',
      'Normalize the answer so it sounds polite, clear, high-trust, and polished.',
      'The tone should feel like premium customer support copy written by very strong marketers, but remain factual and not overhyped.',
      'Do not invent facts that are not supported by the source answer.',
      'Do not add extra keys or commentary.',
      '',
      `Question variants:\nuz: ${params.questions.question_uz}\nru: ${params.questions.question_ru}\nen: ${params.questions.question_en}`,
      '',
      `Source answer:\n${params.sourceAnswer}`,
      params.additionalInstructions
        ? `\nAdditional regeneration instructions:\n${params.additionalInstructions}`
        : '',
    ].join('\n');

    const payload = await GeminiService.generateJson<AnswerVariantsPayload>({
      prompt,
      schemaName: 'faq answer variants',
    });

    return assertAnswerVariants(payload);
  }
}
