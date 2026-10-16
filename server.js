import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import {
  createCompetitionRepository,
  StorageError,
} from "./competitionRepository.js";
import { DomainError, TRANSITIONS } from "./competitionStore.js";
import { createAiService, startWorker } from "./aiService.js";
import { createSecurity, digest } from "./security.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res)).catch(next);
function text(value, max, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new DomainError(`Enter ${label} (${max} characters or fewer).`);
  return value.trim();
}
function operation(req) {
  return text(req.get("Idempotency-Key"), 100, "a request key");
}
function safeJob(job) {
  return {
    id: job.id,
    status: job.status,
    submissionId: job.submissionId,
    error: job.error,
    submission: job.submission
      ? {
          id: job.submission.id,
          title: job.submission.title,
          prompt: job.submission.prompt,
          resultText: job.submission.resultText,
          participantName: job.submission.participantName,
          judgingStatus: job.submission.judgingStatus,
          aiScore: job.submission.aiScore,
        }
      : null,
  };
}
export function createApp({
  env = process.env,
  repository = createCompetitionRepository({ env }),
  ai = createAiService(env),
  worker = true,
} = {}) {
  const app = express(),
    security = createSecurity(env);
  const metrics = {
    requests: 0,
    votes: 0,
    voteFailures: 0,
    aiSuccess: 0,
    aiFailure: 0,
    databaseFailure: 0,
    rateLimited: 0,
    unauthorized: 0,
    aiTotalMs: 0,
    aiAverageMs: 0,
    lastLeaderboardRefresh: null,
  };
  app.disable("x-powered-by");
  app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);
  app.use((req, res, next) => {
    metrics.requests++;
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    if (env.NODE_ENV === "production")
      res.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "8kb" }));
  const call = (action, p) => repository.call(action, p);
  const limit = async (key, max, seconds) =>
    call("limit", { key, max, seconds });
  app.get(
    "/api/session",
    route(async (req, res) => {
      let session = security.read(req);
      if (!session) {
        const token = security.issue("voter", 86400 * 180);
        security.cookie(res, "voter", token, 86400 * 180);
        session = security.read({ headers: { cookie: `po_session=${token}` } });
      }
      let info = await call("session-info", { sessionId: session.id });
      if (info.ended && req.query.fresh === "1") {
        const token = security.issue("voter", 28800);
        security.cookie(res, "voter", token, 28800);
        session = security.read({ headers: { cookie: `po_session=${token}` } });
        security.cookie(
          res,
          "ballot",
          security.issue("ballot", 28800, session.id),
          28800,
        );
        info = { ended: false };
      }
      res.json({ csrf: security.csrf(session.id), ended: info.ended });
    }),
  );
  app.use("/api", (req, res, next) => {
    if (["/health", "/ready"].includes(req.path)) return next();
    const session = security.read(req);
    if (!session)
      return res
        .status(401)
        .json({ error: "Please refresh to restore your event session." });
    req.sessionId = session.id;
    req.voterId = security.read(req, "ballot")?.id || session.id;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.path.startsWith("/admin/") &&
      !security.validCsrf(req, session.id)
    )
      return res
        .status(403)
        .json({ error: "Please refresh before trying again." });
    next();
  });
  app.get("/api/health", (req, res) =>
    res.json({
      ok: true,
      apiVersion: 3,
      boothSessions: true,
      languages: ["en", "zh"],
      storage: repository.kind,
      geminiConfigured: ai.configured,
      model: ai.model,
    }),
  );
  app.get(
    "/api/ready",
    route(async (req, res) => {
      const health = await call("health");
      if (repository.kind === "supabase" && health.schemaVersion !== 4)
        throw new DomainError(
          "Database upgrade required. Ask an organiser to apply migration 004.",
          503,
        );
      res.json({
        ok: true,
        storage: repository.kind,
        storageConnected: true,
        geminiConfigured: ai.configured,
      });
    }),
  );
  app.get(
    "/api/competition",
    route(async (req, res) =>
      res.json(await call("competition", { sessionId: req.voterId })),
    ),
  );
  app.get(
    "/api/stories",
    route(async (req, res) => {
      await limit("browse:" + req.sessionId, 120, 60);
      res.json(
        await call("stories", {
          sessionId: req.voterId,
          offset: Math.max(0, parseInt(req.query.offset) || 0),
        }),
      );
    }),
  );
  let cache = null,
    inflight = null;
  async function leaderboard() {
    if (cache && cache.expires > Date.now()) return cache;
    if (!inflight)
      inflight = call("leaderboard")
        .then((data) => {
          const body = JSON.stringify(data),
            etag = '"' + createHash("sha256").update(body).digest("hex") + '"';
          cache = { data, etag, expires: Date.now() + 3000 };
          metrics.lastLeaderboardRefresh = new Date().toISOString();
          return cache;
        })
        .finally(() => {
          inflight = null;
        });
    return inflight;
  }
  app.get(
    "/api/leaderboard",
    route(async (req, res) => {
      const current = req.query.roundId
        ? {
            data: await call("leaderboard", {
              roundId: text(req.query.roundId, 120, "a round identifier"),
            }),
          }
        : await leaderboard();
      res.set("Cache-Control", "private, max-age=0, must-revalidate");
      if (current.etag) res.set("ETag", current.etag);
      if (current.etag && req.get("If-None-Match") === current.etag)
        return res.status(304).end();
      res.json(current.data);
    }),
  );
  app.post(
    "/api/generate-story",
    route(async (req, res) => {
      if (!ai.configured)
        throw new DomainError(
          "Story creation is temporarily unavailable. Please contact an organiser.",
          503,
        );
      await limit("generate:" + req.sessionId, 10, 60);
      if (req.body.resultText || req.body.aiScore)
        throw new DomainError(
          "Official stories and scores are generated by the server.",
        );
      if (
        req.body.language !== undefined &&
        !["en", "zh"].includes(req.body.language)
      )
        throw new DomainError("Choose English or Chinese for your story.");
      const input = {
        participantName: text(req.body.participantName, 40, "your name"),
        prompt: text(req.body.prompt, 700, "a story idea"),
        theme:
          typeof req.body.theme === "string"
            ? text(req.body.theme, 300, "a challenge")
            : "Creative Story",
        regenerate: req.body.regenerate === true,
        ...(req.body.language === undefined
          ? {}
          : { language: req.body.language }),
      };
      const job = await call("enqueue", {
        sessionId: req.sessionId,
        idempotencyKey: operation(req),
        id: randomUUID(),
        input,
        maxQueue: Math.max(1, Number(env.MAX_QUEUE) || 150),
        maxPerParticipant: Math.max(
          1,
          Number(env.MAX_STORIES_PER_PARTICIPANT) || 5,
        ),
        dailyBudget: Math.max(1, Number(env.DAILY_GENERATION_BUDGET) || 1000),
      });
      res.status(202).json(safeJob(job));
    }),
  );
  app.get(
    "/api/jobs/:jobId",
    route(async (req, res) => {
      await limit("job:" + req.sessionId, 120, 60);
      res.json(
        safeJob(
          await call("job", {
            jobId: req.params.jobId,
            sessionId: req.sessionId,
          }),
        ),
      );
    }),
  );
  app.get(
    "/api/operations/:key",
    route(async (req, res) =>
      res.json(
        safeJob(
          await call("job", {
            idempotencyKey: req.params.key,
            sessionId: req.sessionId,
          }),
        ),
      ),
    ),
  );
  app.post(
    "/api/votes",
    route(async (req, res) => {
      const started = Date.now();
      try {
        await limit("vote:" + req.sessionId, 60, 60);
        if (
          !Number.isInteger(req.body.rating) ||
          req.body.rating < 1 ||
          req.body.rating > 5
        )
          throw new DomainError("Choose a rating from 1 to 5.");
        const result = await call("vote", {
          sessionId: req.voterId,
          authorId: req.sessionId,
          submissionId: text(req.body.submissionId, 120, "a story"),
          rating: req.body.rating,
          idempotencyKey: operation(req),
          id: randomUUID(),
        });
        cache = null;
        metrics.votes++;
        res.status(201).json(result);
      } catch (e) {
        metrics.voteFailures++;
        throw e;
      } finally {
        console.log(
          JSON.stringify({ event: "vote", durationMs: Date.now() - started }),
        );
      }
    }),
  );
  app.get(
    "/api/participant-score/:id",
    route(async (req, res) => {
      res.json(
        await call("participant-score", {
          sessionId: req.voterId,
          submissionId: text(req.params.id, 120, "a story"),
        }),
      );
    }),
  );
  app.post(
    "/api/participant-retry",
    route(async (req, res) => {
      await limit("retry:" + req.sessionId, 3, 300);
      res.json(
        safeJob(
          await call("participant-retry", {
            sessionId: req.sessionId,
            jobId: text(req.body.jobId, 120, "a request key"),
          }),
        ),
      );
    }),
  );
  app.post(
    "/api/finish-participant",
    route(async (req, res) => {
      const result = await call("session-end", {
        sessionId: req.sessionId,
        voterId: req.voterId,
        nextId: randomUUID(),
        resetHash: digest(text(req.body.resetKey, 100, "a request key")),
        ...(req.body.jobId
          ? { jobId: text(req.body.jobId, 120, "a request key") }
          : {}),
        ...(req.body.voteKey
          ? { voteKey: text(req.body.voteKey, 100, "a request key") }
          : {}),
      });
      security.cookie(
        res,
        "voter",
        security.issue("voter", 28800, result.nextId),
        28800,
      );
      security.cookie(
        res,
        "ballot",
        security.issue("ballot", 28800, result.nextId),
        28800,
      );
      res.json({ ok: true, csrf: security.csrf(result.nextId) });
    }),
  );
  app.post(
    "/api/next-voter",
    route(async (req, res) => {
      await limit("next-voter:" + req.sessionId, 60, 60);
      if ((await call("session-info", { sessionId: req.sessionId })).ended)
        throw new DomainError(
          "This participant session has ended. Start a new participant.",
          403,
        );
      const token = security.issue("ballot", 86400);
      security.cookie(res, "ballot", token, 86400);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/voter-code",
    route(async (req, res) => {
      await limit("code:" + req.sessionId, 10, 300);
      res.json(
        await call("redeem", {
          sessionId: req.voterId,
          codeHash: digest(
            text(req.body.code, 100, "your event code").toUpperCase(),
          ),
        }),
      );
    }),
  );
  app.post(
    "/api/admin/login",
    route(async (req, res) => {
      if (!security.validCsrf(req, req.sessionId))
        throw new DomainError("Refresh before signing in.", 403);
      await limit("login:" + digest(req.ip), 10, 900);
      if (
        typeof req.body.password !== "string" ||
        !security.validPassword(req.body.password)
      )
        throw new DomainError("The organiser password is incorrect.", 401);
      const token = security.issue("admin", 3600),
        claims = security.read(
          { headers: { cookie: `po_admin=${token}` } },
          "admin",
        );
      await call("admin-session-create", {
        id: claims.id,
        expires: claims.expires,
      });
      security.cookie(res, "admin", token, 3600);
      res.json({ csrf: security.csrf(claims.id, "admin") });
    }),
  );
  app.use("/api/admin", (req, res, next) =>
    Promise.resolve(
      (async () => {
        const session = security.read(req, "admin");
        if (
          !session ||
          !(await call("admin-session-check", { id: session.id })).valid
        )
          throw new DomainError("Organiser sign-in is required.", 401);
        req.adminId = session.id;
        req.adminCsrf = security.csrf(session.id, "admin");
        if (
          req.method !== "GET" &&
          !security.validCsrf(req, session.id, "admin")
        )
          throw new DomainError(
            "Refresh the organiser page before trying again.",
            403,
          );
        next();
      })(),
    ).catch(next),
  );
  app.get(
    "/api/admin/session",
    route(async (req, res) => res.json({ csrf: req.adminCsrf })),
  );
  app.post(
    "/api/admin/logout",
    route(async (req, res) => {
      await call("admin-session-delete", { id: req.adminId });
      security.cookie(res, "admin", "", 0);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/admin/competition",
    route(async (req, res) => {
      const data = await call("admin"),
        round = await call("competition", { sessionId: req.sessionId });
      res.json({ data, round, metrics, transitions: TRANSITIONS[round.state] });
    }),
  );
  app.get(
    "/api/admin/export",
    route(async (req, res) => {
      res
        .attachment("prompt-olympics-backup.json")
        .json(await call("export", { actor: req.adminId }));
    }),
  );
  app.get(
    "/api/admin/results",
    route(async (req, res) => {
      const { entries } = await call("leaderboard");
      const chinese = req.query.language === "zh";
      const quote = (v) =>
        '"' +
        String(v ?? "")
          .replace(/^(\s*[=+@-])/, "'$1")
          .replaceAll('"', '""') +
        '"';
      const rows = [
        chinese
          ? [
              "排名",
              "姓名",
              "故事标题",
              "AI 评分 / 5",
              "公众评分 / 5",
              "总分 / 5",
              "票数",
              "获奖资格",
            ]
          : [
              "Rank",
              "Name",
              "Title",
              "AI / 5",
              "Public / 5",
              "Combined / 5",
              "Votes",
              "Eligible",
            ],
        ...entries.map((e, i) => [
          i + 1,
          e.participantName,
          e.title,
          e.aiScore,
          e.averageScore,
          e.finalScore,
          e.voteCount,
          chinese ? (e.eligible ? "具备资格" : "暂未具备资格") : e.eligible,
        ]),
      ];
      res
        .attachment("prompt-olympics-results.csv")
        .type("text/csv")
        .send(
          (chinese ? "\uFEFF" : "") +
            rows.map((r) => r.map(quote).join(",")).join("\r\n"),
        );
    }),
  );
  app.post(
    "/api/admin/:action",
    route(async (req, res) => {
      const action = req.params.action,
        p = { actor: req.adminId };
      if (
        [
          "transition",
          "new-round",
          "delete",
          "settings",
          "judge-historical",
        ].includes(action) &&
        req.body.confirm !== true
      )
        throw new DomainError("Confirm this organiser action first.");
      if (action === "transition")
        p.state = text(req.body.state, 30, "a round state");
      else if (action === "new-round") {
        p.id = randomUUID();
        p.title = text(
          req.body.title || "Prompt Olympics",
          100,
          "a round title",
        );
      } else if (["delete", "retry-judge", "judge-historical"].includes(action))
        p.submissionId = text(req.body.submissionId, 120, "a story");
      else if (action === "settings") {
        if (
          !Number.isInteger(req.body.minVotes) ||
          req.body.minVotes < 1 ||
          req.body.minVotes > 1000 ||
          typeof req.body.strictCodes !== "boolean"
        )
          throw new DomainError("Enter a minimum vote count from 1 to 1000.");
        p.minVotes = req.body.minVotes;
        p.strictCodes = req.body.strictCodes;
        if (typeof req.body.boothMode === "boolean")
          p.boothMode = req.body.boothMode;
        if (typeof req.body.allowSelfVotes === "boolean")
          p.allowSelfVotes = req.body.allowSelfVotes;
      } else if (action === "codes") {
        const count = req.body.count;
        if (!Number.isInteger(count) || count < 1 || count > 500)
          throw new DomainError("Choose between 1 and 500 codes.");
        const codes = Array.from({ length: count }, () =>
          randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase(),
        );
        p.hashes = codes.map(digest);
        await call("codes", p);
        return res.json({ codes });
      } else throw new DomainError("Unknown organiser action.", 404);
      const result = await call(action, p);
      cache = null;
      res.json(result);
    }),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  app.use(
    express.static(path.join(root, "dist"), { maxAge: "1h", index: false }),
  );
  app.get("*", (req, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
  app.use((error, req, res, next) => {
    if (error instanceof StorageError) metrics.databaseFailure++;
    const status = error.status || 500;
    if (status === 429) metrics.rateLimited++;
    if (status === 401 || status === 403) metrics.unauthorized++;
    res.status(status).json({
      error:
        error instanceof DomainError || error instanceof StorageError
          ? error.message
          : status === 413
            ? "That request is too large."
            : status === 400
              ? "The request could not be read."
              : "Something went wrong. Please try again.",
    });
  });
  const runner =
    worker && ai.configured
      ? startWorker(repository, ai, {
          concurrency: Math.min(
            20,
            Math.max(1, Number(env.AI_CONCURRENCY) || 6),
          ),
          onMetric: (name, durationMs) => {
            metrics[name] = (metrics[name] || 0) + 1;
            if (name === "aiSuccess" || name === "aiFailure") {
              metrics.aiTotalMs += durationMs;
              metrics.aiAverageMs =
                metrics.aiTotalMs / (metrics.aiSuccess + metrics.aiFailure);
              console.log(JSON.stringify({ event: name, durationMs }));
            }
          },
        })
      : null;
  return { app, repository, stop: () => runner?.stop(), metrics };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const service = createApp(),
    server = service.app.listen(process.env.PORT || 10000, "0.0.0.0", () =>
      console.log(
        JSON.stringify({ event: "started", storage: service.repository.kind }),
      ),
    );
  function shutdown() {
    service.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
