/**
 * Maryam — expression system.
 *
 * Maryam has 8 meaningful expression states. Expressions are driven by:
 *  1. expression tags coming from the AI (desktop mode), or
 *  2. a light, context-based guess from the actual user/assistant text
 *     (used when the AI does not send a tag).
 *
 * Expressions are NOT changed randomly.
 */

export type MaryamExpression =
  | "neutral"
  | "warm"
  | "happy"
  | "curious"
  | "thinking"
  | "concerned"
  | "surprised"
  | "calm";

export const MARYAM_EXPRESSIONS: MaryamExpression[] = [
  "neutral",
  "warm",
  "happy",
  "curious",
  "thinking",
  "concerned",
  "surprised",
  "calm",
];

/** Map legacy expression names (from chat tags) to Maryam's states. */
const LEGACY_EXPRESSION_MAP: Record<string, MaryamExpression> = {
  neutral: "neutral",
  calm: "calm",
  peaceful: "calm",
  serene: "calm",
  relaxed: "calm",
  happy: "happy",
  joy: "happy",
  joyful: "happy",
  laugh: "happy",
  laughing: "happy",
  smile: "happy",
  smiling: "happy",
  giggle: "happy",
  excited: "happy",
  cheerful: "happy",
  warm: "warm",
  affection: "warm",
  affectionate: "warm",
  love: "warm",
  loving: "warm",
  tender: "warm",
  gentle: "warm",
  blush: "warm",
  soft: "warm",
  curious: "curious",
  question: "curious",
  wonder: "curious",
  wondering: "curious",
  interest: "curious",
  interested: "curious",
  attentive: "curious",
  thinking: "thinking",
  think: "thinking",
  ponder: "thinking",
  pondering: "thinking",
  consider: "thinking",
  considering: "thinking",
  thoughtful: "thinking",
  concerned: "concerned",
  worry: "concerned",
  worried: "concerned",
  sad: "concerned",
  sorry: "concerned",
  empathy: "concerned",
  empathetic: "concerned",
  caring: "concerned",
  sympathy: "concerned",
  surprised: "surprised",
  shock: "surprised",
  shocked: "surprised",
  wow: "surprised",
  amazed: "surprised",
  gasp: "surprised",
  surprised_2: "surprised",
};

export function normalizeMaryamExpression(
  expression: string | undefined | null,
): MaryamExpression {
  if (!expression) return "neutral";
  const key = expression.trim().toLowerCase();
  return LEGACY_EXPRESSION_MAP[key] ?? "neutral";
}

/* ────────────────────────────────────────────────────────────────────────
 * Context-based expression guessing (English + Roman Urdu aware).
 * Lightweight keyword cues only — never random.
 * ──────────────────────────────────────────────────────────────────────── */

const SURPRISE_RE =
  /(wow|omg|no way|seriously\?|unbelievable|incredible|kia bol|acha kya|really\?|yaar waa?h|subhanallah|mashallah|kya baat)/i;

const SAD_RE =
  /(sad|unhappy|tired|exhausted|depressed|upset|cry|crying|hard day|rough day|stress|anxious|worried|lonely|hurt|pain|bad day|not good|difficult|struggl|sorrow|heartbreak|afsoos|udaas|dukh|thak|parishan|bore|aaj acha nahi|problem|issue|grief)/i;

const HAPPY_RE =
  /(happy|great|awesome|amazing|love it|excited|fun|wonderful|good news|perfect|fantastic|khush|zabardast|maza|barhiya|aala|bohat acha|shaandaar|yay|wohoo)/i;

const GREETING_RE =
  /^(hi|hello|hey|salam|assalam|assalamu|good morning|good evening|good afternoon|adaab|kya haal|kaise ho|kesi ho|sun|haye)/i;

const QUESTION_RE =
  /(\?|kya|kaise|kahan|kab|kyun|kyon|kaun|batao|bata|batana|who|what|when|where|why|how|can you|will you|do you|should i|tell me|bta)/i;

const THANKS_RE = /(thank|thanks|shukriya|thank you)/i;

/** Guess Maryam's expression while she reads the user's message. */
export function guessExpressionForUserText(text: string): MaryamExpression {
  if (!text) return "neutral";
  if (SURPRISE_RE.test(text)) return "surprised";
  if (SAD_RE.test(text)) return "concerned";
  if (HAPPY_RE.test(text)) return "happy";
  if (THANKS_RE.test(text)) return "warm";
  if (GREETING_RE.test(text)) return "warm";
  if (QUESTION_RE.test(text)) return "curious";
  return "neutral";
}

/** Guess Maryam's expression while she replies. */
export function guessExpressionForAssistantText(text: string): MaryamExpression {
  if (!text) return "warm";
  if (/(i'?m sorry|sorry|i understand|that sounds|i hear you|maaf|afsoos)/i.test(text)) {
    return "concerned";
  }
  if (SURPRISE_RE.test(text)) return "surprised";
  if (HAPPY_RE.test(text) || /(glad|:)|\u{1F600}|\u{1F642}/u.test(text)) {
    return "happy";
  }
  if (QUESTION_RE.test(text)) return "curious";
  return "warm";
}
