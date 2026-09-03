interface PreparedTitle {
  compact: string;
  tokens: string[];
}

const WHITESPACE = /\s+/g;
const DASHES = /[-‐‑‒–—―]/g;
const PUNCTUATION_AND_SYMBOLS = /[\p{P}\p{S}]/gu;
export const SIMILAR_TITLE_THRESHOLD = 0.78;

function prepareTitle(value: string): PreparedTitle {
  const normalized = value
    .normalize('NFKC')
    .replace(DASHES, ' ')
    .replace(PUNCTUATION_AND_SYMBOLS, ' ')
    .trim()
    .toLocaleLowerCase();

  return {
    compact: normalized.replace(WHITESPACE, ''),
    tokens: normalized.split(WHITESPACE).filter((token) => token.length > 1),
  };
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex];
    const leftCharacter = left[leftIndex - 1];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = leftCharacter === right[rightIndex - 1] ? 0 : 1;
      currentRow[rightIndex] = Math.min(
        previousRow[rightIndex] + 1,
        currentRow[rightIndex - 1] + 1,
        previousRow[rightIndex - 1] + substitutionCost,
      );
    }

    previousRow = currentRow;
  }

  return previousRow[right.length];
}

function tokenOverlapScore(left: PreparedTitle, right: PreparedTitle) {
  if (!left.tokens.length || !right.tokens.length) return 0;

  const rightTokens = new Set(right.tokens);
  const [shorter, longer] = left.tokens.length <= right.tokens.length
    ? [left.tokens, right.tokens]
    : [right.tokens, left.tokens];
  const shared = shorter.filter((token) => rightTokens.has(token)).length;
  if (!shared) return 0;

  // A shorter title whose words are all present in a longer title is usually
  // the same song with a version/feature suffix. Keep this above plain edit
  // distance, which over-punishes long suffixes.
  if (shared === shorter.length) return 0.82 + 0.12 * (shorter.length / longer.length);

  return (shared * 2) / (left.tokens.length + right.tokens.length);
}

export function textSimilarity(expected: string, actual: string) {
  const left = prepareTitle(expected);
  const right = prepareTitle(actual);
  if (!left.compact || !right.compact) return 0;
  if (left.compact === right.compact) return 1;

  const containment = left.compact.includes(right.compact) || right.compact.includes(left.compact)
    ? 0.72 + 0.22 * (Math.min(left.compact.length, right.compact.length) / Math.max(left.compact.length, right.compact.length))
    : 0;
  const lengthSimilarity = 1 - levenshteinDistance(left.compact, right.compact)
    / Math.max(left.compact.length, right.compact.length);

  return Math.max(0, Math.min(1, Math.max(containment, lengthSimilarity, tokenOverlapScore(left, right))));
}

export function normalizeTitle(value: string) {
  return prepareTitle(value).compact;
}

export function cleanTrackTitle(title: string | undefined) {
  return title?.trim()
    .replace(/^\s*\d+\s*[.、:：)）-]?\s*/, '')
    .replace(/\s*[／/].*$/, '')
    .trim() ?? '';
}

export function isSimilarTitle(expected: string, actual: string, threshold = 0.78) {
  return textSimilarity(cleanTrackTitle(expected), actual) >= threshold;
}
