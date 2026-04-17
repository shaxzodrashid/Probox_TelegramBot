import { FaqAnswerVariants, FaqQuestionVariants } from '../../types/faq.types';

const APOSTROPHE_VARIANTS_REGEX = /[ʻʼ’‘`´]/g;
const QUOTE_VARIANTS_REGEX = /[“”«»]/g;

export function normalizeFaqQuestion(text: string): string {
  return text
    .normalize('NFKC')
    .replace(APOSTROPHE_VARIANTS_REGEX, "'")
    .replace(QUOTE_VARIANTS_REGEX, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function isExactFaqQuestionMatch(
  candidateQuestions: FaqQuestionVariants,
  userQuestion: string,
): boolean {
  const normalizedUserQuestion = normalizeFaqQuestion(userQuestion);
  if (!normalizedUserQuestion) {
    return false;
  }

  return [
    candidateQuestions.question_uz,
    candidateQuestions.question_ru,
    candidateQuestions.question_en,
  ].some((candidateQuestion) => normalizeFaqQuestion(candidateQuestion) === normalizedUserQuestion);
}

export function getFaqAnswerForLanguage(
  answers: FaqAnswerVariants,
  languageCode?: string,
): string {
  if (languageCode === 'ru') {
    return answers.answer_ru.trim() || answers.answer_uz.trim() || answers.answer_en.trim();
  }

  if (languageCode === 'en') {
    return answers.answer_en.trim() || answers.answer_uz.trim() || answers.answer_ru.trim();
  }

  return answers.answer_uz.trim() || answers.answer_ru.trim() || answers.answer_en.trim();
}

export function getFaqAgentToken(
  answers: FaqAnswerVariants,
  explicitToken?: string | null,
): string | null {
  const token = explicitToken?.trim();
  if (token) {
    return token;
  }

  const answerUz = answers.answer_uz.trim();
  const answerRu = answers.answer_ru.trim();
  const answerEn = answers.answer_en.trim();

  if (!answerUz || !answerRu || !answerEn) {
    return null;
  }

  if (answerUz === answerRu && answerRu === answerEn) {
    return answerUz;
  }

  return null;
}

export function isFaqSemanticDistanceAccepted(
  distance: number,
  maxDistance: number,
): boolean {
  return Number.isFinite(distance) && Number.isFinite(maxDistance) && distance <= maxDistance;
}
