import db from '../database/database';
import {
  FaqAnswerVariants,
  FaqNeighbor,
  FaqQuestionVariants,
  FaqRecord,
} from '../types/faq.types';

interface CreateDraftFaqInput extends FaqQuestionVariants {
  embedding: number[];
  adminTelegramId: number;
}

export interface PaginatedFaqResult {
  items: FaqRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class FaqService {
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
        created_by_admin_telegram_id: input.adminTelegramId,
        locked_by_admin_telegram_id: input.adminTelegramId,
        workflow_stage: 'awaiting_answer',
        vector_embedding: this.toVectorLiteral(input.embedding),
        updated_at: new Date(),
      })
      .returning('*');

    return record;
  }

  static async getLockedDraftForAdmin(adminTelegramId: number): Promise<FaqRecord | null> {
    const record = await db<FaqRecord>('faqs')
      .where({
        status: 'draft',
        locked_by_admin_telegram_id: adminTelegramId,
      })
      .orderBy('updated_at', 'desc')
      .first();

    return record || null;
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
      items,
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

    return record || null;
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

    return record || null;
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

    return record || null;
  }
}
