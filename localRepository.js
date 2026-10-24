// Explicit development only: one process, atomic file commits. Never a production fallback.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { uniqueStoryTitle } from "./storyTitles.js";
import {
  createCompetition,
  createRound,
  getCurrentRound,
  buildLeaderboard,
  createVote,
  createSubmission,
  setCompetitionState,
  startNewRound,
  DomainError,
} from "./competitionStore.js";

export function createLocalRepository(filename) {
  let store = fs.existsSync(filename)
    ? JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""))
    : createCompetition();
  if (store.schemaVersion !== 2 && fs.existsSync(filename))
    throw new Error(
      "Use a new LOCAL_DATA_PATH or migrate the legacy file first.",
    );
  store.schemaVersion = 2;
  store.adminSessions ??= [];
  store.endedSessions ??= {};
  // Preserve published snapshots and continue in a new open round.
  const current = getCurrentRound(store);
  if (current.state === "RESULTS") {
    const next = createRound(
      Math.max(...store.rounds.map((r) => r.roundNumber)) + 1,
      current.title,
    );
    for (const key of [
      "minVotes",
      "strictCodes",
      "boothMode",
      "allowSelfVotes",
    ])
      next[key] = current[key];
    store.rounds.push(next);
    store.currentRoundIndex = store.rounds.length - 1;
  } else current.state = "SUBMISSIONS_OPEN";

  function commit() {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename + ".tmp", JSON.stringify(store));
    fs.renameSync(filename + ".tmp", filename);
  }
  commit();
  const publicJob = (j) => ({
    ...j,
    submission:
      store.rounds
        .flatMap((r) => r.submissions)
        .find((s) => s.id === j.submissionId) || null,
  });
  function run(action, p) {
    const r = getCurrentRound(store),
      now = Date.now();
    const j = store.jobs.find(
      (j) =>
        j.id === p.jobId ||
        (j.sessionId === p.sessionId && j.operationId === p.idempotencyKey),
    );
    const story = store.rounds
      .flatMap((r) => r.submissions)
      .find((s) => s.id === p.submissionId);
    if (
      [
        "enqueue",
        "vote",
        "job",
        "redeem",
        "participant-score",
        "participant-retry",
      ].includes(action) &&
      store.endedSessions[p.sessionId]
    )
      throw new DomainError(
        "This participant session has ended. Start a new participant.",
        403,
      );
    if (action === "session-info")
      return { ended: !!store.endedSessions[p.sessionId] };
    if (action === "session-end") {
      if (store.endedSessions[p.sessionId]) {
        if (store.endedSessions[p.sessionId].resetHash !== p.resetHash)
          throw new DomainError(
            "This participant session has ended. Start a new participant.",
            403,
          );
        return { nextId: store.endedSessions[p.sessionId].nextId };
      }
      if (
        store.jobs.some(
          (j) =>
            j.sessionId === p.sessionId &&
            !j.submissionId &&
            !["ready", "failed"].includes(j.status),
        )
      )
        throw new DomainError(
          "Wait for the story to finish saving before starting the next participant.",
          409,
        );
      if (
        p.jobId &&
        !store.jobs.some((j) => j.id === p.jobId && j.sessionId === p.sessionId)
      )
        throw new DomainError("Request not found.", 404);
      if (
        p.voteKey &&
        !store.rounds.some((r) =>
          r.votes.some(
            (v) =>
              v.voterSession === (p.voterId || p.sessionId) &&
              v.idempotencyKey === p.voteKey,
          ),
        )
      )
        throw new DomainError(
          "Confirm the pending vote before starting the next participant.",
          409,
        );
      store.endedSessions[p.sessionId] = {
        nextId: p.nextId,
        resetHash: p.resetHash,
      };
      if (p.voterId)
        store.endedSessions[p.voterId] = {
          nextId: p.nextId,
          resetHash: p.resetHash,
        };
      return { nextId: p.nextId };
    }
    if (action === "participant-score") {
      const round = store.rounds.find((r) =>
        r.submissions.some((s) => s.id === p.submissionId && !s.deleted),
      );
      if (!round) throw new DomainError("Story not found.", 404);
      const vote = round.votes.find(
        (v) =>
          v.submissionId === p.submissionId && v.voterSession === p.sessionId,
      );
      return {
        voted: !!vote,
        rating: vote?.overall,
        entry: buildLeaderboard(round).find(
          (e) => e.submissionId === p.submissionId,
        ),
      };
    }
    if (action === "participant-retry") {
      if (!j || j.sessionId !== p.sessionId)
        throw new DomainError("Request not found.", 404);
      const round = store.rounds.find((r) => r.id === j.roundId);
      if (
        round.state === "RESULTS" ||
        (!j.submissionId && round.state !== "SUBMISSIONS_OPEN")
      )
        throw new DomainError("This round is closed.", 409);
      if (j.status === "failed") {
        j.status = j.submissionId ? "judging" : "queued";
        j.attempts = 0;
        j.judgeAttempts = 0;
        j.error = null;
        j.leaseUntil = 0;
        j.availableAt = now;
        if (story) story.judgingStatus = "pending";
      }
      return publicJob(j);
    }
    if (action === "admin-session-create") {
      store.adminSessions = store.adminSessions.filter((s) => s.expires > now);
      store.adminSessions.push(p);
      return {};
    }
    if (action === "admin-session-check")
      return {
        valid: store.adminSessions.some(
          (s) => s.id === p.id && s.expires > now,
        ),
      };
    if (action === "admin-session-delete") {
      store.adminSessions = store.adminSessions.filter((s) => s.id !== p.id);
      return {};
    }
    if (action === "health")
      return { ok: true, storageConnected: true, schemaVersion: 6 };
    if (action === "limit") {
      store.limits = store.limits.filter((l) => l.expiresAt > now);
      let l = store.limits.find((l) => l.key === p.key);
      if (!l) {
        l = { key: p.key, count: 0, expiresAt: now + p.seconds * 1000 };
        store.limits.push(l);
      }
      if (++l.count > p.max)
        throw new DomainError("Please wait a moment before trying again.", 429);
      return {};
    }
    if (action === "competition")
      return {
        id: r.id,
        title: r.title,
        roundNumber: r.roundNumber,
        state: r.state,
        minVotes: r.minVotes,
        strictCodes: !!r.strictCodes,
        boothMode: !!r.boothMode,
        allowSelfVotes: r.allowSelfVotes !== false,
        verified: store.codes.some(
          (c) => c.roundId === r.id && c.voterId === p.sessionId,
        ),
      };
    if (action === "leaderboard") {
      const round = p.roundId
        ? store.rounds.find((r) => r.id === p.roundId)
        : r;
      if (!round) throw new DomainError("Round not found.", 404);
      return {
        round: {
          id: round.id,
          title: round.title,
          roundNumber: round.roundNumber,
          state: round.state,
          minVotes: round.minVotes,
        },
        entries: buildLeaderboard(round),
        final: round.state === "RESULTS",
      };
    }
    if (action === "stories") {
      const all = r.submissions
        .filter((s) => !s.deleted)
        .map((s) => {
          const v = r.votes.find(
            (v) => v.submissionId === s.id && v.voterSession === p.sessionId,
          );
          return {
            id: s.id,
            title: s.title,
            participantName: s.participantName,
            prompt: s.prompt,
            resultText: s.resultText,
            own: s.participantSession === p.sessionId,
            voted: !!v,
            rating: v?.overall,
          };
        })
        .sort(
          (a, b) =>
            Number(a.voted) - Number(b.voted) ||
            hash(a.id + p.sessionId) - hash(b.id + p.sessionId),
        );
      return {
        items: all.slice(p.offset || 0, (p.offset || 0) + 20),
        hasMore: (p.offset || 0) + 20 < all.length,
      };
    }
    if (action === "vote") {
      if (
        r.strictCodes &&
        !store.codes.some(
          (c) => c.roundId === r.id && c.voterId === p.sessionId,
        )
      )
        throw new DomainError("Enter your event voting code first.", 403);
      return createVote(store, { ...p, voterSession: p.sessionId });
    }
    if (action === "job") {
      if (!j || j.sessionId !== p.sessionId)
        throw new DomainError("Request not found.", 404);
      return publicJob(j);
    }
    if (action === "enqueue") {
      if (j) {
        if (JSON.stringify(j.input) !== JSON.stringify(p.input))
          throw new DomainError(
            "This request key belongs to another story idea.",
            409,
          );
        return publicJob(j);
      }
      if (r.state !== "SUBMISSIONS_OPEN")
        throw new DomainError("Story submissions are closed.", 409);
      if (
        store.jobs.filter((j) => !["ready", "failed"].includes(j.status))
          .length >= p.maxQueue
      )
        throw new DomainError(
          "Many stories are being created. Please try again shortly.",
          429,
        );
      if (
        store.jobs.filter(
          (j) => j.roundId === r.id && j.sessionId === p.sessionId,
        ).length >= p.maxPerParticipant
      )
        throw new DomainError(
          "You have reached the story limit for this round.",
          429,
        );
      if (
        store.jobs.filter((j) => j.createdAt > now - 86400000).length >=
        p.dailyBudget
      )
        throw new DomainError("Today’s story allowance is used.", 429);
      const job = {
        id: p.id,
        roundId: r.id,
        sessionId: p.sessionId,
        operationId: p.idempotencyKey,
        input: p.input,
        status: "queued",
        attempts: 0,
        judgeAttempts: 0,
        createdAt: now,
        availableAt: now,
      };
      store.jobs.push(job);
      return publicJob(job);
    }
    if (action === "claim") {
      if (
        store.jobs.filter(
          (j) => j.leaseUntil > now && !["ready", "failed"].includes(j.status),
        ).length >= p.concurrency
      )
        return null;
      const next = store.jobs.find(
        (j) =>
          !["ready", "failed"].includes(j.status) &&
          j.availableAt <= now &&
          !(j.leaseUntil > now),
      );
      if (!next) return null;
      if (
        (next.submissionId && next.judgeAttempts >= 3) ||
        (!next.submissionId && !next.generated && next.attempts >= 3)
      ) {
        next.status = "failed";
        next.error = "The AI service could not finish this request.";
        const s = store.rounds
          .flatMap((r) => r.submissions)
          .find((s) => s.id === next.submissionId);
        if (s) s.judgingStatus = "failed";
        return null;
      }
      next.status = next.submissionId
        ? "judging"
        : next.generated
          ? "saving"
          : "generating";
      next.leaseToken = p.token;
      next.leaseUntil = now + p.leaseSeconds * 1000;
      if (next.submissionId) next.judgeAttempts++;
      else if (!next.generated) next.attempts++;
      return publicJob(next);
    }
    if (["generated", "save", "judged", "fail"].includes(action)) {
      if (!j || j.leaseToken !== p.token || j.leaseUntil <= now)
        throw new DomainError("Job lease expired.", 409);
      const round = store.rounds.find((r) => r.id === j.roundId);
      if (round.state === "RESULTS")
        throw new DomainError("Results are final.", 409);
      if (action === "generated") {
        j.generated = p.generated;
        j.status = "saving";
      }
      if (action === "save") {
        if (!j.generated) throw new DomainError("Missing generated story.");
        if (!round.submissions.some((s) => s.id === j.id))
          createSubmission(store, {
            id: j.id,
            roundId: j.roundId,
            participantSession: j.sessionId,
            ...j.input,
            title: uniqueStoryTitle(
              j.generated.title,
              round.submissions.filter((s) => !s.deleted).map((s) => s.title),
            ),
            resultText: j.generated.text,
          });
        j.submissionId = j.id;
        j.status = "judging";
        j.leaseUntil = 0;
        j.leaseToken = null;
      }
      if (action === "judged") {
        const s = round.submissions.find((s) => s.id === j.submissionId);
        if (!s.aiScore) s.aiScore = p.score;
        s.judgingStatus = "ready";
        j.status = "ready";
        j.error = null;
        j.leaseUntil = 0;
      }
      if (action === "fail") {
        j.status =
          p.retryable && (j.submissionId ? j.judgeAttempts : j.attempts) < 3
            ? j.submissionId
              ? "judging"
              : "queued"
            : "failed";
        j.error = p.error;
        j.availableAt = now + p.delay * 1000;
        j.leaseUntil = 0;
        const s = round.submissions.find((s) => s.id === j.submissionId);
        if (s && j.status === "failed") s.judgingStatus = "failed";
      }
      return publicJob(j);
    }
    if (action === "export" || action === "admin")
      return structuredClone(store);
    if (action === "redeem") {
      const code = store.codes.find(
        (c) =>
          c.roundId === r.id &&
          c.hash === p.codeHash &&
          (!c.voterId || c.voterId === p.sessionId),
      );
      if (!code)
        throw new DomainError("That code is invalid or already used.", 403);
      if (
        store.codes.some(
          (c) => c.roundId === r.id && c.voterId === p.sessionId && c !== code,
        )
      )
        throw new DomainError("You already have a code.", 409);
      code.voterId = p.sessionId;
      return { verified: true };
    }
    if (action === "transition") setCompetitionState(store, p.state);
    else if (action === "new-round") startNewRound(store, p.title);
    else {
      if (r.state === "RESULTS")
        throw new DomainError(
          "Published results are immutable. Start a new round.",
          409,
        );
      if (action === "delete") {
        if (!story || story.roundId !== r.id)
          throw new DomainError("Story not found.", 404);
        story.deleted = true;
      } else if (action === "retry-judge") {
        const job = store.jobs.find(
          (j) =>
            j.submissionId === p.submissionId &&
            j.roundId === r.id &&
            j.status === "failed",
        );
        if (!job)
          throw new DomainError("Only failed judging can be retried.", 409);
        job.status = "judging";
        job.judgeAttempts = 0;
        job.availableAt = now;
        job.leaseUntil = 0;
        story.judgingStatus = "pending";
      } else if (action === "judge-historical") {
        if (
          !story?.legacy ||
          story.aiScore ||
          story.roundId !== r.id ||
          store.jobs.some((j) => j.submissionId === story.id)
        )
          throw new DomainError(
            "Only an unscored historical story can be judged through this action.",
            409,
          );
        store.jobs.push({
          id: "historical-judge-" + story.id,
          roundId: r.id,
          sessionId: story.participantSession,
          operationId: "historical-judge-" + story.id,
          input: {
            participantName: story.participantName,
            prompt: story.prompt,
          },
          status: "judging",
          submissionId: story.id,
          attempts: 0,
          judgeAttempts: 0,
          createdAt: now,
          availableAt: now,
        });
      } else if (action === "settings") {
        r.minVotes = p.minVotes;
        r.strictCodes = p.strictCodes;
        if (typeof p.boothMode === "boolean") r.boothMode = p.boothMode;
        if (typeof p.allowSelfVotes === "boolean")
          r.allowSelfVotes = p.allowSelfVotes;
      } else if (action === "codes")
        store.codes.push(...p.hashes.map((hash) => ({ hash, roundId: r.id })));
      else throw new DomainError("Unknown operation.");
    }
    store.audit.push({
      id: randomUUID(),
      actor: p.actor,
      action,
      roundId: r.id,
      createdAt: now,
    });
    return { ok: true };
  }
  return {
    kind: "local",
    async call(action, p = {}) {
      const before = structuredClone(store);
      try {
        const result = run(action, p);
        commit();
        return structuredClone(result);
      } catch (e) {
        store = before;
        throw e;
      }
    },
  };
}
function hash(s) {
  let n = 0;
  for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return n;
}
