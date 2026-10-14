import { createHash } from "node:crypto";
const hash = (s) => createHash("sha256").update(s).digest("hex");
export function prepareMigration(raw, { legacyOpenState } = {}) {
  const source = raw.competition ?? raw;
  if (!Array.isArray(source.rounds) || !source.rounds.length)
    throw new Error("Invalid legacy backup.");
  const records = {
      rounds: [],
      participants: [],
      submissions: [],
      judgements: [],
      votes: [],
    },
    ids = new Set(),
    identities = new Set(),
    warnings = [];
  const addId = (id) => {
    if (typeof id !== "string" || !id || ids.has(id))
      throw new Error("Missing or duplicate legacy ID.");
    ids.add(id);
    return id;
  };
  const date = (v) => {
    if (!Number.isFinite(v)) throw new Error("Missing or invalid timestamp.");
    return new Date(v).toISOString();
  };
  for (const [index, r] of source.rounds.entries()) {
    const rid = addId(r.id);
    let state = r.state;
    if (state === "OPEN") {
      if (
        !["SUBMISSIONS_OPEN", "SUBMISSIONS_CLOSED", "VOTING"].includes(
          legacyOpenState,
        )
      )
        throw new Error(
          "OPEN has ambiguous rules. Specify --legacy-open-state=SUBMISSIONS_OPEN or SUBMISSIONS_CLOSED or VOTING.",
        );
      state = legacyOpenState;
      warnings.push("Legacy OPEN mapped to " + state);
    }
    if (
      ![
        "WAITING",
        "SUBMISSIONS_OPEN",
        "SUBMISSIONS_CLOSED",
        "VOTING",
        "RESULTS",
      ].includes(state)
    )
      throw new Error("Invalid legacy round state.");
    if (!Array.isArray(r.submissions) || !Array.isArray(r.votes))
      throw new Error("Missing submissions or votes.");
    // A legacy RESULTS round has no trustworthy official snapshot; stop for explicit reconciliation.
    if (state === "RESULTS" && !Array.isArray(r.snapshot))
      throw new Error(
        "Legacy RESULTS needs a verified snapshot before importing. Keep the backup and reconcile this round explicitly.",
      );
    if (
      state === "RESULTS" &&
      r.snapshot.some(
        (entry) =>
          typeof entry.submissionId !== "string" ||
          typeof entry.participantName !== "string" ||
          !["aiScore", "averageScore", "finalScore"].every(
            (key) =>
              entry[key] === null ||
              (typeof entry[key] === "number" &&
                Number.isFinite(entry[key]) &&
                entry[key] >= 0 &&
                entry[key] <= 5),
          ) ||
          !Number.isInteger(entry.voteCount) ||
          typeof entry.eligible !== "boolean",
      )
    ) {
      throw new Error(
        "Historical final snapshot must use verified five-point ranking fields; reconcile it without recalculating the official order.",
      );
    }
    records.rounds.push({
      id: rid,
      competition_id: "prompt-olympics",
      number: r.roundNumber ?? index + 1,
      title: r.title || "Prompt Olympics",
      state,
      min_votes: r.minVotes ?? 5,
      snapshot: r.snapshot ?? null,
      legacy: r,
      created_at: date(r.createdAt),
    });
    const subs = new Set();
    for (const s of r.submissions) {
      const id = addId(s.id);
      subs.add(id);
      if (!s.participantName || !s.prompt || !s.resultText)
        throw new Error("Incomplete legacy story.");
      const session =
          "legacy:" +
          hash(s.participantSession?.trim().toLowerCase() || "unknown:" + id),
        pid = "legacy-participant:" + hash(rid + session);
      if (!records.participants.some((p) => p.id === pid))
        records.participants.push({
          id: pid,
          name: s.participantName,
          session_id: session,
          round_id: rid,
          created_at: date(s.createdAt),
        });
      records.submissions.push({
        id,
        round_id: rid,
        participant_id: pid,
        title: s.title || "Untitled story",
        prompt: s.prompt,
        story: s.resultText,
        legacy: s,
        created_at: date(s.createdAt),
      });
      const score = s.aiScore;
      if (score) {
        const scale =
          score.max === 5
            ? 1
            : score.max === 10 || score.max === undefined
              ? 2
              : null;
        if (
          !scale ||
          !Number.isFinite(score.overall) ||
          score.overall < 0 ||
          score.overall > 5 * scale
        )
          throw new Error("Invalid AI scale or score.");
        // Five-point historical values remain exactly as stored. Never apply a grading curve again.
        records.judgements.push({
          submission_id: id,
          status: "ready",
          humour: typeof score.funny === "number" ? score.funny / scale : null,
          originality:
            typeof score.creativity === "number"
              ? score.creativity / scale
              : null,
          relevance:
            typeof score.relevance === "number"
              ? score.relevance / scale
              : null,
          overall: score.overall / scale,
          model: "legacy-heuristic",
          rubric: "legacy-" + (score.gradingVersion ?? "original"),
          legacy: score,
        });
      } else {
        records.judgements.push({ submission_id: id, status: "pending" });
        warnings.push("Missing historic score retained as pending: " + id);
      }
    }
    for (const v of r.votes) {
      const id = addId(v.id),
        rating = v.overall ?? v.ratings?.overall;
      if (
        !subs.has(v.submissionId) ||
        !v.voterSession ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      )
        throw new Error(
          "Invalid or orphaned vote; reconcile the backup before importing.",
        );
      const voter = "legacy:" + hash(v.voterSession.trim().toLowerCase()),
        unique = rid + ":" + v.submissionId + ":" + voter;
      if (identities.has(unique))
        throw new Error(
          "Duplicate voter/story in legacy data; reconcile before import.",
        );
      identities.add(unique);
      records.votes.push({
        id,
        round_id: rid,
        submission_id: v.submissionId,
        voter_id: voter,
        rating,
        operation_id: "legacy:" + id,
        legacy: v,
        created_at: date(v.createdAt),
      });
    }
  }
  const current = source.currentRoundIndex ?? 0;
  if (!Number.isInteger(current) || !records.rounds[current])
    throw new Error("Invalid current round.");
  return {
    records,
    currentRoundId: records.rounds[current].id,
    digest: hash(JSON.stringify(raw)),
    warnings,
    counts: Object.fromEntries(
      Object.entries(records).map(([k, v]) => [k, v.length]),
    ),
  };
}
