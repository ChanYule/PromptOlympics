export type RoundState =
  "WAITING" | "SUBMISSIONS_OPEN" | "SUBMISSIONS_CLOSED" | "VOTING" | "RESULTS";
export type Round = {
  id: string;
  title: string;
  roundNumber: number;
  state: RoundState;
  minVotes: number;
  strictCodes?: boolean;
  boothMode?: boolean;
  allowSelfVotes?: boolean;
  verified?: boolean;
};
export type Entry = {
  story?: string | null;
  submissionId: string;
  participantName: string;
  title: string;
  aiScore: number | null;
  averageScore: number | null;
  finalScore: number | null;
  voteCount: number;
  eligible: boolean;
  judgingStatus: string;
};
export type Rankings = { round: Round; entries: Entry[]; final: boolean };
export type Story = {
  id: string;
  participantName: string;
  title: string;
  prompt: string;
  resultText: string;
  own?: boolean;
  voted?: boolean;
  rating?: number;
  aiScore?: {
    overall: number;
    humour?: number;
    originality?: number;
    relevance?: number;
  };
  judgingStatus?: string;
};
export type Job = {
  id: string;
  status: string;
  error?: string;
  submissionId?: string;
  submission: Story | null;
};
