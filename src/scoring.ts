export type HumanVote = { funny: number; creative: number; surprise: number; fit: number };
type ScorableStory = { ai: { overall: number }; votes: HumanVote[] };

export const AI_WEIGHT = 0.5;
export const HUMAN_WEIGHT = 0.5;

// Existing saved AI scores use a ten-point scale. Convert at the boundary so
// older stories and new stories are displayed and combined consistently.
export function aiScore(score: number) {
  return score / 2;
}

export function humanScore(story: ScorableStory): number | null {
  if (!story.votes.length) return null;
  const average = story.votes.reduce((sum, vote) =>
    sum + (vote.funny + vote.creative + vote.surprise + vote.fit) / 4, 0) / story.votes.length;
  return average;
}

export function finalScore(story: ScorableStory) {
  const human = humanScore(story);
  // Until a human votes, show the AI score as a clearly labelled provisional score.
  const ai = aiScore(story.ai.overall);
  return human === null ? ai : ai * AI_WEIGHT + human * HUMAN_WEIGHT;
}
