export type FaqStatus = 'draft' | 'published';

export type FaqWorkflowStage = 'awaiting_answer' | 'completed';

export interface FaqQuestionVariants {
  question_uz: string;
  question_ru: string;
  question_en: string;
}

export interface FaqAnswerVariants {
  answer_uz: string;
  answer_ru: string;
  answer_en: string;
}

export interface FaqRecord extends FaqQuestionVariants, FaqAnswerVariants {
  id: number;
  status: FaqStatus;
  vector_embedding: string;
  agent_enabled: boolean;
  agent_token: string | null;
  created_by_admin_telegram_id: number;
  locked_by_admin_telegram_id: number | null;
  workflow_stage: FaqWorkflowStage | null;
  created_at: Date;
  updated_at: Date;
}

export interface FaqNeighbor extends FaqQuestionVariants {
  id: number;
  distance: number;
}
