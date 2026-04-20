import { config } from '../../config';
import { FaqRecord } from '../../types/faq.types';
import {
  FAQ_ROUTING_MIN_MARGIN,
  FAQ_ROUTING_MIN_SCORE,
  FAQ_STATIC_ROUTING_CONCEPT_LEAD_MIN_SCORE,
  FAQ_STATIC_ROUTING_MIN_SCORE,
  rankFaqCandidatesForRouting,
} from '../../utils/faq/faq-routing-score.util';
import {
  faqLooksLikeStockCheck,
  isStockCheckQuestion,
} from '../../utils/faq/inventory-intent.util';
import { logger } from '../../utils/logger';
import { FaqAiService } from './faq-ai.service';
import { FaqCandidateRecord, FaqService } from './faq.service';

export interface SupportFaqResolution {
  faq: FaqRecord;
  resolutionType: 'exact' | 'semantic' | 'semantic_ai';
  distance?: number;
  confidence?: number;
  reason?: string;
}

const previewSupportQuestion = (question: string, maxLength: number = 160): string => {
  const normalized = question.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

export class FaqRoutingService {
  static async resolveSupportFaq(question: string): Promise<SupportFaqResolution | null> {
    const questionPreview = previewSupportQuestion(question);
    logger.info(`[FAQ_ROUTING] Resolving support question="${questionPreview}"`);

    const exactMatch = await FaqService.findExactPublishedFaqByQuestion(question);
    if (exactMatch) {
      logger.info(`[FAQ_ROUTING] Exact FAQ match found: faq:${exactMatch.id} for question="${questionPreview}"`);
      return {
        faq: exactMatch,
        resolutionType: 'exact',
      };
    }

    logger.info(`[FAQ_ROUTING] No exact FAQ match found for question="${questionPreview}"`);

    if (!config.FAQ_SEMANTIC_AUTO_REPLY_ENABLED) {
      logger.info('[FAQ_ROUTING] Semantic FAQ auto-reply is disabled; falling back to human support.');
      return null;
    }

    const candidates = await FaqService.findSemanticFaqCandidatesByQuestion(question);
    if (candidates.length === 0) {
      logger.info(`[FAQ_ROUTING] No semantic FAQ candidates found for question="${questionPreview}"`);
      return null;
    }

    const rankedCandidates = rankFaqCandidatesForRouting(
      question,
      candidates,
      config.FAQ_AUTO_REPLY_MAX_DISTANCE,
    );
    const topCandidate = rankedCandidates[0];
    const secondCandidate = rankedCandidates[1];
    const scoreMargin = topCandidate && secondCandidate
      ? topCandidate.routingScore - secondCandidate.routingScore
      : topCandidate?.routingScore ?? 0;
    const topMatchedConceptCount = topCandidate?.matchedConcepts.length ?? 0;
    const secondMatchedConceptCount = secondCandidate?.matchedConcepts.length ?? 0;
    const hasStaticConceptLead = topMatchedConceptCount > secondMatchedConceptCount;
    const aiCandidates = rankedCandidates
      .filter((candidate, index) => candidate.routingScore >= FAQ_ROUTING_MIN_SCORE || index === 0)
      .slice(0, 3);
    const stockCheckQuestion = isStockCheckQuestion(question);
    const stockCheckAgentCandidates = rankedCandidates.filter(
      (candidate) => candidate.faq.agent_enabled && faqLooksLikeStockCheck(candidate.faq),
    );

    logger.info(
      `[FAQ_ROUTING] Hybrid-ranked semantic candidates for question="${questionPreview}": ${rankedCandidates
        .map((candidate) => `faq:${candidate.faq.id}@distance=${candidate.distance.toFixed(4)}/score=${candidate.routingScore.toFixed(4)}`)
        .join(', ')}`,
    );

    logger.info(
      `[FAQ_ROUTING] Semantic candidates for question="${questionPreview}": ${candidates
        .map((candidate) => `faq:${candidate.faq.id}@${candidate.distance.toFixed(4)}`)
        .join(', ')}`,
    );

    if (stockCheckQuestion && stockCheckAgentCandidates.length === 1) {
      logger.info(
        `[FAQ_ROUTING] Deterministically routed stock-check question="${questionPreview}" to dedicated agent FAQ faq:${stockCheckAgentCandidates[0].faq.id}`,
      );
      return this.toSemanticResolution(
        stockCheckAgentCandidates[0],
        1,
        'Stock-check questions always route to the dedicated AI inventory agent when a single matching agent FAQ candidate is available.',
      );
    }

    if (
      topCandidate &&
      !topCandidate.faq.agent_enabled &&
      topCandidate.routingScore >= FAQ_STATIC_ROUTING_MIN_SCORE &&
      (
        scoreMargin >= FAQ_ROUTING_MIN_MARGIN ||
        (topCandidate.routingScore >= FAQ_STATIC_ROUTING_CONCEPT_LEAD_MIN_SCORE && hasStaticConceptLead)
      )
    ) {
      logger.info(
        `[FAQ_ROUTING] Accepted static semantic FAQ auto-reply for question="${questionPreview}" using faq:${topCandidate.faq.id} distance=${topCandidate.distance.toFixed(4)} score=${topCandidate.routingScore.toFixed(4)} margin=${scoreMargin.toFixed(4)} conceptLead=${topMatchedConceptCount}-${secondMatchedConceptCount}`,
      );
      return this.toSemanticResolution(
        topCandidate,
        1,
        hasStaticConceptLead && scoreMargin < FAQ_ROUTING_MIN_MARGIN
          ? 'Top semantic FAQ candidate covered more of the user intent than the runner-up.'
          : 'Top semantic FAQ candidate cleared the static auto-reply threshold.',
        'semantic',
      );
    }

    if (
      topCandidate &&
      !topCandidate.faq.agent_enabled &&
      topCandidate.routingScore >= FAQ_ROUTING_MIN_SCORE
    ) {
      logger.info(
        `[FAQ_ROUTING] Accepted high-confidence static FAQ auto-reply for question="${questionPreview}" using faq:${topCandidate.faq.id} score=${topCandidate.routingScore.toFixed(4)} without agent gating.`,
      );
      return this.toSemanticResolution(
        topCandidate,
        1,
        'Top semantic FAQ candidate cleared the high-confidence static threshold.',
        'semantic',
      );
    }

    try {
      const decision = await FaqAiService.chooseSupportFaqCandidate({
        userMessage: question,
        candidates: aiCandidates,
      });
      const matchedStockCheckCandidate = stockCheckQuestion
        ? rankedCandidates.find(
          (candidate) =>
            candidate.faq.id === decision?.matchedFaqId &&
            candidate.faq.agent_enabled &&
            faqLooksLikeStockCheck(candidate.faq),
        )
        : undefined;

      if (!decision?.shouldAutoReply || !decision.matchedFaqId) {
        if (
          decision?.shouldAutoReply &&
          !decision.matchedFaqId &&
          topCandidate &&
          topCandidate.routingScore >= FAQ_ROUTING_MIN_SCORE &&
          scoreMargin >= FAQ_ROUTING_MIN_MARGIN
        ) {
          logger.warn(
            `[FAQ_ROUTING] AI approved FAQ auto-reply but omitted matched FAQ ID for question="${questionPreview}". Falling back to top hybrid-ranked candidate faq:${topCandidate.faq.id} score=${topCandidate.routingScore.toFixed(2)} margin=${scoreMargin.toFixed(2)}`,
          );
          return this.toSemanticResolution(topCandidate, decision.confidence, decision.reason);
        }

        logger.info(
          `[FAQ_ROUTING] AI declined FAQ auto-reply for question="${questionPreview}" matchedFaqId=${decision?.matchedFaqId ?? 'null'} confidence=${decision?.confidence?.toFixed(2) ?? 'n/a'} reason="${decision?.reason || 'n/a'}"`,
        );
        return null;
      }

      if (
        decision.confidence < config.FAQ_AUTO_REPLY_MIN_CONFIDENCE &&
        !matchedStockCheckCandidate &&
        !(topCandidate && decision.matchedFaqId === topCandidate.faq.id && topCandidate.routingScore >= FAQ_ROUTING_MIN_SCORE && scoreMargin >= FAQ_ROUTING_MIN_MARGIN)
      ) {
        logger.info(
          `[FAQ_ROUTING] Rejected AI FAQ route for question="${questionPreview}" because confidence ${decision.confidence.toFixed(2)} is below threshold ${config.FAQ_AUTO_REPLY_MIN_CONFIDENCE.toFixed(2)}`,
        );
        return null;
      }

      if (matchedStockCheckCandidate && decision.confidence < config.FAQ_AUTO_REPLY_MIN_CONFIDENCE) {
        logger.info(
          `[FAQ_ROUTING] Accepted low-confidence stock-check AI route for question="${questionPreview}" using faq:${matchedStockCheckCandidate.faq.id} confidence=${decision.confidence.toFixed(2)}`,
        );
      }

      const selectedCandidate = rankedCandidates.find(
        (candidate) => candidate.faq.id === decision.matchedFaqId,
      );

      if (!selectedCandidate) {
        logger.warn(
          `[FAQ_ROUTING] Gemini selected FAQ ${decision.matchedFaqId} for question="${questionPreview}" but it was not present in the semantic candidate set`,
        );
        return null;
      }

      logger.info(
        `[FAQ_ROUTING] Accepted semantic FAQ auto-reply for question="${questionPreview}" using faq:${selectedCandidate.faq.id} distance=${selectedCandidate.distance.toFixed(4)} confidence=${decision.confidence.toFixed(2)}`,
      );

      return this.toSemanticResolution(selectedCandidate, decision.confidence, decision.reason);
    } catch (error) {
      logger.warn(
        `[FAQ_ROUTING] Smart FAQ routing failed for question="${questionPreview}", forwarding support request to admins instead.`,
        error,
      );
      return null;
    }
  }

  private static toSemanticResolution(
    candidate: FaqCandidateRecord,
    confidence: number,
    reason: string,
    resolutionType: SupportFaqResolution['resolutionType'] = 'semantic_ai',
  ): SupportFaqResolution {
    return {
      faq: candidate.faq,
      resolutionType,
      distance: candidate.distance,
      confidence,
      reason,
    };
  }
}
