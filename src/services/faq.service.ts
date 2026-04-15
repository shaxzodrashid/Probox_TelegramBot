import { config } from '../config';
import db from '../database/database';
import {
  FaqAnswerVariants,
  FaqNeighbor,
  FaqQuestionVariants,
  FaqRecord,
} from '../types/faq.types';
import { FaqEmbeddingService } from './faq-embedding.service';
import { isExactFaqQuestionMatch } from '../utils/faq-match.util';
import { logger } from '../utils/logger';

interface CreateDraftFaqInput extends FaqQuestionVariants {
  embedding: number[];
  adminTelegramId: number;
}

interface UpdateDraftAgentSettingsInput {
  agentEnabled: boolean;
  agentToken: string | null;
}

export interface PaginatedFaqResult {
  items: FaqRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SemanticFaqMatchResult {
  faq: FaqRecord;
  distance: number;
}

export interface FaqCandidateRecord {
  faq: FaqRecord;
  distance: number;
}

const previewQuestionForLogs = (question: string, maxLength: number = 160): string => {
  const normalized = question.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const toSafeNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
};

const normalizeFaqRecord = (faq: FaqRecord): FaqRecord => ({
  ...faq,
  id: toSafeNumber(faq.id),
  agent_enabled: faq.agent_enabled === true,
  agent_token: faq.agent_token?.trim() || null,
  created_by_admin_telegram_id: toSafeNumber(faq.created_by_admin_telegram_id),
  locked_by_admin_telegram_id:
    faq.locked_by_admin_telegram_id === null
      ? null
      : toSafeNumber(faq.locked_by_admin_telegram_id),
});

export class FaqService {
  private static isMissingFaqTableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybePgError = error as { code?: string; message?: string };
    return (
      maybePgError.code === '42P01' &&
      maybePgError.message?.includes('relation "faqs" does not exist') === true
    );
  }

  static async getLockedDraftForAdmin(adminTelegramId: number): Promise<FaqRecord | null> {
    try {
      const record = await db<FaqRecord>('faqs')
        .where({
          status: 'draft',
          locked_by_admin_telegram_id: adminTelegramId,
        })
        .orderBy('updated_at', 'desc')
        .first();

      return record ? normalizeFaqRecord(record) : null;
    } catch (error) {
      if (this.isMissingFaqTableError(error)) {
        logger.warn('FAQ table is missing while checking locked draft; returning no draft.');
        return null;
      }

      throw error;
    }
  }

  private static toVectorLiteral(values: number[]): string {
    return `[${values.join(',')}]`;
  }

  static async searchNearestPublishedFaqs(
    embedding: number[],
    limit: number,
  ): Promise<FaqNeighbor[]> {
    const vectorLiteral = this.toVectorLiteral(embedding);
    const result = await db.raw(
      `
        SELECT
          id,
          question_uz,
          question_ru,
          question_en,
          (vector_embedding <=> ?::vector) AS distance
        FROM faqs
        WHERE status = 'published'
        ORDER BY vector_embedding <=> ?::vector
        LIMIT ?
      `,
      [vectorLiteral, vectorLiteral, limit],
    );

    return (result.rows || []).map((row: Record<string, unknown>) => ({
      id: Number(row.id),
      question_uz: String(row.question_uz || ''),
      question_ru: String(row.question_ru || ''),
      question_en: String(row.question_en || ''),
      distance: Number(row.distance || 0),
    }));
  }

  static async createDraftFaq(input: CreateDraftFaqInput): Promise<FaqRecord> {
    const [record] = await db<FaqRecord>('faqs')
      .insert({
        question_uz: input.question_uz,
        question_ru: input.question_ru,
        question_en: input.question_en,
        answer_uz: '',
        answer_ru: '',
        answer_en: '',
        status: 'draft',
        agent_enabled: false,
        agent_token: null,
        created_by_admin_telegram_id: input.adminTelegramId,
        locked_by_admin_telegram_id: input.adminTelegramId,
        workflow_stage: 'awaiting_answer',
        vector_embedding: this.toVectorLiteral(input.embedding),
        updated_at: new Date(),
      })
      .returning('*');

    return normalizeFaqRecord(record);
  }

  static async listPublishedFaqs(
    page: number,
    pageSize: number,
  ): Promise<PaginatedFaqResult> {
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);

    const totalRow = await db<FaqRecord>('faqs')
      .where({ status: 'published' })
      .count<{ total: string }>('id as total')
      .first();

    const total = Number(totalRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const normalizedPage = Math.min(safePage, totalPages);

    const items = await db<FaqRecord>('faqs')
      .where({ status: 'published' })
      .orderBy('created_at', 'desc')
      .offset((normalizedPage - 1) * safePageSize)
      .limit(safePageSize);

    return {
      items: items.map(normalizeFaqRecord),
      page: normalizedPage,
      pageSize: safePageSize,
      total,
      totalPages,
    };
  }

  static async getPublishedFaqById(faqId: number): Promise<FaqRecord | null> {
    const record = await db<FaqRecord>('faqs')
      .where({
        id: faqId,
        status: 'published',
      })
      .first();

    return record ? normalizeFaqRecord(record) : null;
  }

  static async getPublishedFaqsByIds(faqIds: number[]): Promise<FaqRecord[]> {
    if (faqIds.length === 0) {
      return [];
    }

    const items = await db<FaqRecord>('faqs')
      .where({ status: 'published' })
      .whereIn('id', faqIds)
      .select('*');

    const normalizedItems = items.map(normalizeFaqRecord);
    const itemsById = new Map(normalizedItems.map((item) => [item.id, item]));
    return faqIds
      .map((faqId) => itemsById.get(faqId))
      .filter((item): item is FaqRecord => Boolean(item));
  }

  static async findExactPublishedFaqByQuestion(question: string): Promise<FaqRecord | null> {
    try {
      const publishedFaqs = await db<FaqRecord>('faqs')
        .where({ status: 'published' })
        .orderBy('created_at', 'desc')
        .select('*');

      const exactMatch = publishedFaqs.find((faq) => isExactFaqQuestionMatch(faq, question));
      logger.debug(
        `[FAQ_EXACT] Checked ${publishedFaqs.length} published FAQs for question="${previewQuestionForLogs(question)}"; matched=${exactMatch ? `faq:${exactMatch.id}` : 'none'}`,
      );
      return exactMatch || null;
    } catch (error) {
      if (this.isMissingFaqTableError(error)) {
        logger.warn('FAQ table is missing while checking exact FAQ support matches.');
        return null;
      }

      throw error;
    }
  }

  static async findSemanticPublishedFaqByQuestion(
    question: string,
  ): Promise<SemanticFaqMatchResult | null> {
    try {
      const embedding = await FaqEmbeddingService.embedQuestionQuery(question);
      const [bestNeighbor] = await this.searchNearestPublishedFaqs(embedding, 1);

      if (!bestNeighbor || bestNeighbor.distance > config.FAQ_AUTO_REPLY_MAX_DISTANCE) {
        return null;
      }

      const faq = await this.getPublishedFaqById(bestNeighbor.id);
      if (!faq) {
        return null;
      }

      return {
        faq,
        distance: bestNeighbor.distance,
      };
    } catch (error) {
      if (this.isMissingFaqTableError(error)) {
        logger.warn('FAQ table is missing while checking semantic FAQ support matches.');
        return null;
      }

      throw error;
    }
  }

  static async findSemanticFaqCandidatesByQuestion(
    question: string,
    limit: number = config.FAQ_SIMILAR_LIMIT,
  ): Promise<FaqCandidateRecord[]> {
    try {
      logger.info(
        `[FAQ_SEMANTIC] Searching candidates for question="${previewQuestionForLogs(question)}" limit=${limit} maxDistance=${config.FAQ_AUTO_REPLY_MAX_DISTANCE.toFixed(4)}`,
      );
      const embedding = await FaqEmbeddingService.embedQuestionQuery(question);
      logger.debug(
        `[FAQ_SEMANTIC] Generated embedding with ${embedding.length} dimensions for question="${previewQuestionForLogs(question)}"`,
      );
      const neighbors = await this.searchNearestPublishedFaqs(embedding, limit);
      logger.debug(
        `[FAQ_SEMANTIC] Raw nearest neighbors: ${
          neighbors.length > 0
            ? neighbors.map((neighbor) => `faq:${neighbor.id}@${neighbor.distance.toFixed(4)}`).join(', ')
            : 'none'
        }`,
      );
      const eligibleNeighbors = neighbors.filter(
        (neighbor) => neighbor.distance <= config.FAQ_AUTO_REPLY_MAX_DISTANCE,
      );

      logger.info(
        `[FAQ_SEMANTIC] Eligible neighbors within threshold: ${
          eligibleNeighbors.length > 0
            ? eligibleNeighbors.map((neighbor) => `faq:${neighbor.id}@${neighbor.distance.toFixed(4)}`).join(', ')
            : 'none'
        }`,
      );

      if (eligibleNeighbors.length === 0) {
        return [];
      }

      const faqs = await this.getPublishedFaqsByIds(eligibleNeighbors.map((neighbor) => neighbor.id));
      const normalizedFaqs = faqs.map(normalizeFaqRecord);
      const faqById = new Map(normalizedFaqs.map((faq) => [faq.id, faq]));

      const candidates = eligibleNeighbors
        .map((neighbor) => {
          const faq = faqById.get(neighbor.id);
          if (!faq) {
            return null;
          }

          return {
            faq,
            distance: neighbor.distance,
          };
        })
        .filter((item): item is FaqCandidateRecord => Boolean(item));

      logger.info(
        `[FAQ_SEMANTIC] Final FAQ candidates: ${
          candidates.length > 0
            ? candidates.map((candidate) => `faq:${candidate.faq.id}@${candidate.distance.toFixed(4)}`).join(', ')
            : 'none'
        }`,
      );

      return candidates;
    } catch (error) {
      if (this.isMissingFaqTableError(error)) {
        logger.warn('FAQ table is missing while searching semantic FAQ support candidates.');
        return [];
      }

      throw error;
    }
  }

  static async updateDraftAnswerVariants(
    faqId: number,
    adminTelegramId: number,
    answers: FaqAnswerVariants,
  ): Promise<FaqRecord | null> {
    const [record] = await db<FaqRecord>('faqs')
      .where({
        id: faqId,
        status: 'draft',
        locked_by_admin_telegram_id: adminTelegramId,
      })
      .update({
        ...answers,
        updated_at: new Date(),
      })
      .returning('*');

    return record ? normalizeFaqRecord(record) : null;
  }

  static async updateDraftAgentSettings(
    faqId: number,
    adminTelegramId: number,
    input: UpdateDraftAgentSettingsInput,
  ): Promise<FaqRecord | null> {
    const [record] = await db<FaqRecord>('faqs')
      .where({
        id: faqId,
        status: 'draft',
        locked_by_admin_telegram_id: adminTelegramId,
      })
      .update({
        agent_enabled: input.agentEnabled,
        agent_token: input.agentToken?.trim() || null,
        updated_at: new Date(),
      })
      .returning('*');

    return record ? normalizeFaqRecord(record) : null;
  }

  static async publishFaq(
    faqId: number,
    adminTelegramId: number,
  ): Promise<FaqRecord | null> {
    const [record] = await db<FaqRecord>('faqs')
      .where({
        id: faqId,
        status: 'draft',
        locked_by_admin_telegram_id: adminTelegramId,
      })
      .update({
        status: 'published',
        workflow_stage: 'completed',
        locked_by_admin_telegram_id: null,
        updated_at: new Date(),
      })
      .returning('*');

    return record ? normalizeFaqRecord(record) : null;
  }
}
