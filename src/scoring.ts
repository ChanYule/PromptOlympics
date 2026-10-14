// Official scoring is calculated by the server from committed database records.
export const AI_WEIGHT = 0.5;
export const PUBLIC_WEIGHT = 0.5;
export function combinedScore(
  ai: number | null,
  publicAverage: number | null,
): number | null {
  return ai === null || publicAverage === null
    ? null
    : ai * AI_WEIGHT + publicAverage * PUBLIC_WEIGHT;
}
