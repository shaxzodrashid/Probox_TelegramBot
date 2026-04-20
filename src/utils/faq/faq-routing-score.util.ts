import { FaqCandidateRecord } from '../../services/faq/faq.service';
import { normalizeFaqQuestion } from './faq-match.util';

export interface RankedFaqCandidateRecord extends FaqCandidateRecord {
  routingScore: number;
  matchedConcepts: string[];
}

const TOKEN_REGEX = /[\p{L}\p{N}']+/gu;
const MIN_FUZZY_MATCH_SCORE = 0.82;
const MIN_CONCEPT_FUZZY_MATCH_SCORE = 0.84;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'assalomu',
  'alaykum',
  'are',
  'as',
  'at',
  'bilan',
  'bo',
  "bo'ladi",
  "bo'ladi",
  "bo'lsa",
  "bo'ylab",
  'bu',
  'bormi',
  'bor',
  'boshqa',
  'da',
  'de',
  'do',
  'for',
  'ga',
  'ham',
  'hello',
  'hi',
  'i',
  'if',
  'in',
  'is',
  'iltimos',
  'kompaniya',
  'kompaniyasi',
  'kompaniyasining',
  'li',
  'me',
  'men',
  'mi',
  'my',
  'na',
  'of',
  'or',
  'the',
  'there',
  'to',
  'salom',
  'salomlar',
  'siz',
  'sizda',
  'sizlar',
  'sizlarda',
  'va',
  'with',
  'yerda',
  'you',
]);

const CITY_TOKENS = new Set([
  'andijon',
  'buxoro',
  'fargona',
  "farg'ona",
  'guliston',
  'jizzax',
  'namangan',
  'navoiy',
  'nukus',
  'qarshi',
  'qoqon',
  "qo'qon",
  'samarqand',
  'samarkand',
  'tashkent',
  'termiz',
  'toshkent',
  'urgench',
  'xiva',
]);

const CONCEPT_GROUPS: Record<string, string[]> = {
  branch: [
    'branch',
    'branches',
    'filial',
    'filiali',
    'filialari',
    'filialaring',
    'filiallar',
    'office',
    'offices',
    'ofis',
    'ofisi',
    'ofislar',
    'shaxobcha',
    'shaxobchangiz',
    'shaxobchalar',
    'shoxobcha',
    'shoxobchasi',
    'shoxobchangiz',
    'shoxobchalar',
    'xizmat',
  ],
  coverage: [
    'across',
    'area',
    'areas',
    'boylab',
    'country',
    'countrywide',
    'hudud',
    'hududda',
    'hududlarda',
    'hududlar',
    'region',
    'regions',
    'respublika',
    'shahar',
    'shaharda',
    'shaharlar',
    'viloyat',
    'viloyatda',
    'viloyatlar',
  ],
  current_availability: [
    'available',
    'bormi',
    'bor',
    'currently',
    'est',
    'есть',
    'have',
    'joylashganmi',
    'located',
    'mavjud',
    'open',
  ],
  future_plan: [
    'future',
    'kelajakda',
    'ochish',
    'ochmoqchi',
    'plan',
    'plans',
    'reja',
    'rejangiz',
  ],
  shipping: [
    'deliver',
    'delivery',
    'dostavka',
    'dostavkela',
    'dostavke',
    'jonat',
    "jo'nat",
    'send',
    'yetkazib',
  ],
  count: [
    'count',
    'nechta',
    'qancha',
    'soni',
    'total',
  ],
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const canonicalizeToken = (token: string): string => {
  let normalized = normalizeFaqQuestion(token)
    .replace(/^'+|'+$/g, '')
    .replace(/ko'/g, 'ko')
    .replace(/o'/g, 'o')
    .replace(/g'/g, 'g')
    .replace(/yo'/g, 'yo');

  const suffixes = [
    'laringiz',
    'larimiz',
    'laridan',
    'lardan',
    'larning',
    'laring',
    'lari',
    'larni',
    'larga',
    'lardan',
    'larda',
    'lar',
    'ingiz',
    'ingizda',
    'ingizni',
    'ning',
    'dagi',
    'dagi',
    'dan',
    'dagi',
    'dagi',
    'dagi',
    'ga',
    'da',
    'ni',
    'mi',
    'si',
  ];

  for (const suffix of suffixes) {
    if (normalized.length - suffix.length >= 4 && normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }

  if (normalized.startsWith('shaxobch')) {
    return normalized.replace(/^shaxobch/, 'shoxobch');
  }

  return normalized;
};

const tokenize = (text: string): string[] => {
  const normalized = normalizeFaqQuestion(text);
  const matches = normalized.match(TOKEN_REGEX) || [];

  return matches
    .map(canonicalizeToken)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
};

const bigrams = (value: string): Set<string> => {
  if (value.length < 2) {
    return new Set([value]);
  }

  const grams = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2));
  }

  return grams;
};

const diceCoefficient = (left: string, right: string): number => {
  if (left === right) {
    return 1;
  }

  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);

  let overlap = 0;
  leftBigrams.forEach((gram) => {
    if (rightBigrams.has(gram)) {
      overlap += 1;
    }
  });

  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
};

const getTokenMatchScore = (token: string, candidateTokens: string[]): number => {
  let best = 0;

  for (const candidateToken of candidateTokens) {
    const score = token === candidateToken ? 1 : diceCoefficient(token, candidateToken);
    if (score > best) {
      best = score;
    }
  }

  return best >= MIN_FUZZY_MATCH_SCORE ? best : 0;
};

const matchesConceptMember = (token: string, member: string): boolean => {
  const canonicalMember = canonicalizeToken(member);
  if (!canonicalMember) {
    return false;
  }

  return (
    token === canonicalMember ||
    (canonicalMember.length >= 5 && token.startsWith(canonicalMember)) ||
    (token.length >= 5 && canonicalMember.startsWith(token)) ||
    diceCoefficient(token, canonicalMember) >= MIN_CONCEPT_FUZZY_MATCH_SCORE
  );
};

const getConcepts = (tokens: string[]): Set<string> => {
  const concepts = new Set<string>();

  for (const [concept, members] of Object.entries(CONCEPT_GROUPS)) {
    if (members.some((member) => tokens.some((token) => matchesConceptMember(token, member)))) {
      concepts.add(concept);
    }
  }

  if (tokens.some((token) => CITY_TOKENS.has(token))) {
    concepts.add('specific_city');
  }

  return concepts;
};

const buildCandidateSearchText = (candidate: FaqCandidateRecord): string => {
  return [
    candidate.faq.question_uz,
    candidate.faq.question_ru,
    candidate.faq.question_en,
    candidate.faq.answer_uz,
    candidate.faq.answer_ru,
    candidate.faq.answer_en,
  ].join('\n');
};

const computeLexicalScore = (queryTokens: string[], candidateTokens: string[]): number => {
  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const total = queryTokens.reduce((sum, token) => {
    const weight = token.length >= 7 ? 1.25 : 1;
    return sum + weight;
  }, 0);

  const matched = queryTokens.reduce((sum, token) => {
    const weight = token.length >= 7 ? 1.25 : 1;
    return sum + getTokenMatchScore(token, candidateTokens) * weight;
  }, 0);

  return clamp(matched / total);
};

const computeConceptScore = (
  queryConcepts: Set<string>,
  candidateConcepts: Set<string>,
): { score: number; matchedConcepts: string[] } => {
  const matchedConcepts = [...queryConcepts].filter((concept) => candidateConcepts.has(concept));
  const queryCount = queryConcepts.size;

  return {
    score: queryCount === 0 ? 0 : matchedConcepts.length / queryCount,
    matchedConcepts,
  };
};

const computeIntentAdjustments = (
  queryConcepts: Set<string>,
  candidateConcepts: Set<string>,
): number => {
  let adjustment = 0;

  if (
    queryConcepts.has('branch') &&
    queryConcepts.has('specific_city') &&
    candidateConcepts.has('branch') &&
    candidateConcepts.has('coverage')
  ) {
    adjustment += 0.12;
  }

  if (
    queryConcepts.has('current_availability') &&
    candidateConcepts.has('future_plan') &&
    !candidateConcepts.has('current_availability')
  ) {
    adjustment -= 0.18;
  }

  if (queryConcepts.has('branch') && candidateConcepts.has('shipping')) {
    adjustment -= 0.22;
  }

  if (
    queryConcepts.has('branch') &&
    queryConcepts.has('current_availability') &&
    !queryConcepts.has('count') &&
    candidateConcepts.has('count')
  ) {
    adjustment -= 0.12;
  }

  if (queryConcepts.has('count') && candidateConcepts.has('count')) {
    adjustment += 0.14;
  }

  if (
    queryConcepts.has('count') &&
    candidateConcepts.has('branch') &&
    !candidateConcepts.has('count')
  ) {
    adjustment -= 0.12;
  }

  return adjustment;
};

export const FAQ_ROUTING_MIN_SCORE = 0.5;
export const FAQ_STATIC_ROUTING_MIN_SCORE = 0.2;
export const FAQ_STATIC_ROUTING_CONCEPT_LEAD_MIN_SCORE = 0.4;
export const FAQ_ROUTING_MIN_MARGIN = 0.08;

export function rankFaqCandidatesForRouting(
  userMessage: string,
  candidates: FaqCandidateRecord[],
  maxDistance: number,
): RankedFaqCandidateRecord[] {
  const queryTokens = tokenize(userMessage);
  const queryConcepts = getConcepts(queryTokens);

  return candidates
    .map((candidate) => {
      const candidateTokens = tokenize(buildCandidateSearchText(candidate));
      const candidateConcepts = getConcepts(candidateTokens);
      const lexicalScore = computeLexicalScore(queryTokens, candidateTokens);
      const conceptScore = computeConceptScore(queryConcepts, candidateConcepts);
      const semanticScore = clamp(1 - candidate.distance / Math.max(maxDistance, 0.0001));
      const intentAdjustment = computeIntentAdjustments(queryConcepts, candidateConcepts);

      const routingScore = clamp(
        semanticScore * 0.45 +
        lexicalScore * 0.35 +
        conceptScore.score * 0.20 +
        intentAdjustment,
      );

      return {
        ...candidate,
        routingScore,
        matchedConcepts: conceptScore.matchedConcepts,
      };
    })
    .sort((left, right) => {
      if (right.routingScore !== left.routingScore) {
        return right.routingScore - left.routingScore;
      }

      return left.distance - right.distance;
    });
}
