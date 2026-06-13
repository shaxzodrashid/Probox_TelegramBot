import { config } from '../../config';
import {
  FaqAnswerVariants,
  FaqAuthoringResult,
  FaqNeighbor,
  FaqQuestionVariants,
  FaqRecord,
} from '../../types/faq.types';
import { logger } from '../../utils/logger';
import { GeminiService } from '../gemini.service';

interface QuestionVariantsPayload {
  question_uz?: string;
  question_ru?: string;
  question_en?: string;
  intent_description?: string;
  utterances_uz?: string[];
  utterances_ru?: string[];
  utterances_en?: string[];
}

interface AnswerVariantsPayload {
  answer_uz?: string;
  answer_ru?: string;
  answer_en?: string;
}

interface SupportRoutingPayload {
  should_auto_reply?: boolean;
  matched_faq_id?: number | string | null;
  confidence?: number;
  reason?: string;
}

export interface SupportFaqRoutingDecision {
  shouldAutoReply: boolean;
  matchedFaqId: number | null;
  confidence: number;
  reason: string;
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

const normalizeUtterances = (values: string[] | undefined): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const assertQuestionVariants = (payload: QuestionVariantsPayload): FaqAuthoringResult => {
  const question_uz = payload.question_uz?.trim();
  const question_ru = payload.question_ru?.trim();
  const question_en = payload.question_en?.trim();
  const intent_description = payload.intent_description?.trim();
  const utterances_uz = normalizeUtterances(payload.utterances_uz);
  const utterances_ru = normalizeUtterances(payload.utterances_ru);
  const utterances_en = normalizeUtterances(payload.utterances_en);

  if (
    !question_uz ||
    !question_ru ||
    !question_en ||
    !intent_description ||
    utterances_uz.length === 0 ||
    utterances_ru.length === 0 ||
    utterances_en.length === 0
  ) {
    throw new Error('Gemini returned an incomplete FAQ retrieval profile');
  }

  return {
    question_uz,
    question_ru,
    question_en,
    retrieval_profile: {
      intent_description,
      utterances_uz,
      utterances_ru,
      utterances_en,
    },
  };
};

const FAQ_AUTHORING_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    question_uz: { type: 'string' },
    question_ru: { type: 'string' },
    question_en: { type: 'string' },
    intent_description: { type: 'string' },
    utterances_uz: {
      type: 'array',
      items: { type: 'string' },
      minItems: 6,
      maxItems: 20,
    },
    utterances_ru: {
      type: 'array',
      items: { type: 'string' },
      minItems: 6,
      maxItems: 20,
    },
    utterances_en: {
      type: 'array',
      items: { type: 'string' },
      minItems: 6,
      maxItems: 20,
    },
  },
  required: [
    'question_uz',
    'question_ru',
    'question_en',
    'intent_description',
    'utterances_uz',
    'utterances_ru',
    'utterances_en',
  ],
  additionalProperties: false,
};

const FAQ_RETRIEVAL_ARCHITECT_INSTRUCTION = [
  'You are the FAQ Retrieval Dataset Architect for a multilingual Telegram customer-support bot.',
  'Your output is production retrieval data, not marketing copy and not a translation exercise.',
  'The stored document embedding and exact alias matcher will be built from your output.',
  'The admin input may be a question, command, greeting, short phrase, list of examples, intent label, or prose describing what messages should trigger one FAQ answer.',
  'Infer the target incoming-message intent precisely before writing data.',
  'A target utterance is what an end user may actually send to the bot.',
  'Never convert a non-question intent such as a greeting, thanks, goodbye, confirmation, or command into a meta-question about that intent.',
  'Preserve explicit examples from the admin input as trigger utterances whenever they belong to the target intent.',
  'Generate broad but precise lexical coverage, including natural wording, short forms, polite forms, colloquial forms, and common orthographic variants.',
  'Do not add neighboring intents that should receive a different answer.',
  'The question_uz, question_ru, and question_en fields are concise admin-facing intent labels. They do not have to be grammatical questions.',
  'The intent_description is a language-neutral English definition of exactly when this FAQ should match.',
  'Each utterance list must contain realistic standalone user messages in that language, not explanations or labels.',
].join('\n');

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

const normalizeConfidence = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value as number));
};

const coerceFaqId = (value: number | string | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
  }

  return null;
};

const extractFaqIdFromReason = (
  reason: string | undefined,
  candidateIds: number[],
): number | null => {
  if (!reason) {
    return null;
  }

  const matches = reason.match(/faq(?:\s+id)?\s*[:#]?\s*(\d+)/i);
  if (!matches?.[1]) {
    return null;
  }

  const extracted = Number(matches[1]);
  return candidateIds.includes(extracted) ? extracted : null;
};

const assertSupportRoutingDecision = (
  payload: SupportRoutingPayload,
  candidateIds: number[],
): SupportFaqRoutingDecision => {
  const shouldAutoReply = payload.should_auto_reply === true;
  const matchedFaqId = coerceFaqId(payload.matched_faq_id)
    ?? extractFaqIdFromReason(payload.reason, candidateIds);

  return {
    shouldAutoReply,
    matchedFaqId,
    confidence: normalizeConfidence(payload.confidence),
    reason: payload.reason?.trim() || '',
  };
};

const formatFaqCandidate = (candidate: {
  faq: FaqRecord;
  distance: number;
  routingScore?: number;
  matchedConcepts?: string[];
}): string => {
  return [
    `FAQ ID: ${candidate.faq.id}`,
    `distance: ${candidate.distance.toFixed(6)}`,
    `routing_score: ${typeof candidate.routingScore === 'number' ? candidate.routingScore.toFixed(6) : 'n/a'}`,
    `matched_concepts: ${candidate.matchedConcepts?.join(', ') || 'none'}`,
    `agent_enabled: ${!!candidate.faq.agent_enabled}`,
    `agent_token: ${candidate.faq.agent_token || 'none'}`,
    `question_uz: ${candidate.faq.question_uz}`,
    `question_ru: ${candidate.faq.question_ru}`,
    `question_en: ${candidate.faq.question_en}`,
    `answer_uz: ${candidate.faq.answer_uz}`,
    `answer_ru: ${candidate.faq.answer_ru}`,
    `answer_en: ${candidate.faq.answer_en}`,
  ].join('\n');
};

const previewTextForLogs = (value: string, maxLength: number = 160): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

export class FaqAiService {
  static async generateQuestionVariants(params: {
    sourceQuestion: string;
    neighbors: FaqNeighbor[];
  }): Promise<FaqAuthoringResult> {
    const prompt = [
      'Create one expert-quality multilingual retrieval profile for the target FAQ intent.',
      'Return only the JSON required by the response schema.',
      'Produce 8-15 diverse trigger utterances per language when the intent supports that variety.',
      'Keep all three language sets semantically aligned, but make each set sound native rather than literally translated.',
      'Use nearby FAQs only to avoid accidental intent duplication. Do not distort the target intent merely to increase vector distance.',
      'Do not answer the FAQ.',
      '',
      `Admin intent description and examples:\n${params.sourceQuestion}`,
      '',
      `Nearest published FAQ neighbors:\n${formatNeighbors(params.neighbors)}`,
    ].join('\n');

    const payload = await GeminiService.generateJson<QuestionVariantsPayload>({
      model: config.GEMINI_FAQ_AUTHORING_MODEL,
      prompt,
      schemaName: 'FAQ retrieval profile',
      systemInstruction: FAQ_RETRIEVAL_ARCHITECT_INSTRUCTION,
      responseSchema: FAQ_AUTHORING_RESPONSE_SCHEMA,
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

  static async chooseSupportFaqCandidate(params: {
    userMessage: string;
    candidates: Array<{
      faq: FaqRecord;
      distance: number;
      routingScore?: number;
      matchedConcepts?: string[];
    }>;
  }): Promise<SupportFaqRoutingDecision | null> {
    const agentCandidates = params.candidates.filter((candidate) => candidate.faq.agent_enabled);

    if (agentCandidates.length === 0) {
      logger.info('[FAQ_AI] Skipping AI candidate selection because there are no agent-enabled candidates.');
      return null;
    }

    logger.info(
      `[FAQ_AI] Evaluating ${agentCandidates.length} agent-enabled candidates for userMessage="${previewTextForLogs(params.userMessage)}": ${agentCandidates
        .map((candidate) => `faq:${candidate.faq.id}@${candidate.distance.toFixed(4)}`)
        .join(', ')}`,
    );

    const prompt = [
      'You route Telegram support messages between an AI Support Agent and human admins.',
      'Return valid JSON with exactly these keys: should_auto_reply, matched_faq_id, confidence, reason.',
      'Choose should_auto_reply=true ONLY if the matching FAQ has an AI agent (agent_enabled: true) that covers the intent of the message (e.g. checking stock for specific models, prices, or general questions that an agent can handle).',
      'IMPORTANT: The AI agent will answer the user dynamically using live tools. No static FAQ answer selection should be performed! Ignore any candidate FAQ where agent_enabled is false.',
      'If should_auto_reply=true, matched_faq_id is mandatory and must be the ID of the matched FAQ with agent_enabled: true.',
      'Never return matched_faq_id=null when should_auto_reply=true.',
      'If the user message requires account-specific help, order review, complex troubleshooting, or the AI agent cannot handle it, return should_auto_reply=false.',
      'Do not guess. Be conservative.',
      'When should_auto_reply=false, set matched_faq_id to null.',
      'confidence must be a number from 0 to 1.',
      '',
      `User message:\n${params.userMessage}`,
      '',
      'Candidate FAQs:',
      agentCandidates.map(formatFaqCandidate).join('\n\n'),
    ].join('\n');

    const payload = await GeminiService.generateJson<SupportRoutingPayload>({
      prompt,
      schemaName: 'support FAQ routing decision',
    });

    const decision = assertSupportRoutingDecision(
      payload,
      agentCandidates.map((candidate) => candidate.faq.id),
    );

    logger.info(
      `[FAQ_AI] Gemini routing decision: shouldAutoReply=${decision.shouldAutoReply} matchedFaqId=${decision.matchedFaqId ?? 'null'} confidence=${decision.confidence.toFixed(2)} reason="${decision.reason || 'n/a'}"`,
    );

    return decision;
  }
}
