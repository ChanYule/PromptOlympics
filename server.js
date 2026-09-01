import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL, normalizeModelName } from "./geminiConfig.js";
import {
  buildLeaderboard,
  createCompetition,
  createSubmission,
  createVote,
  deleteAllSubmissions,
  deleteSubmission,
  getAverageScore,
  getCurrentRound,
  persistCompetitionStore,
  readCompetitionStore,
  resetCompetition,
  resetVotes,
  setCompetitionState,
  startNewRound
} from "./competitionStore.js";

const app = express();
const port = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");
const adminPassword = process.env.ADMIN_PASSWORD || process.env.PROMPT_OLYMPICS_ADMIN_PASSWORD || "prompt-olympics-admin";

const getModel = () => {
  const configured = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  return normalizeModelName(configured);
};

function geminiErrorDetails(error) {
  const status = typeof error === "object" && error && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown Gemini error";
  return { status, name, message };
}

function errorResponse(error) {
  const { status, name, message } = geminiErrorDetails(error);
  const messageLower = message.toLowerCase();
  if (name === "AbortError") return { status: 504, error: "Gemini timed out. Please try again." };
  if (status === 401 || /api key.*(invalid|not valid)|invalid api key/.test(messageLower)) {
    return { status: 502, error: "Gemini rejected the API key." };
  }
  if (status === 403) return { status: 502, error: "Gemini denied permission for this API key." };
  if (status === 404) return { status: 502, error: `Gemini model '${getModel()}' was not found or is unavailable.` };
  if (status === 429) return { status: 429, error: "Gemini is rate-limited. Please try again shortly." };
  if (status && status >= 500) return { status: 502, error: "Gemini is temporarily unavailable. Please try again." };
  return { status: 502, error: "Gemini could not generate the story. Please try again." };
}

async function generateGeminiText(contents, config = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is missing");
    error.code = "MISSING_API_KEY";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);
  try {
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: getModel(),
      contents,
      config: { ...config, abortSignal: controller.signal }
    });
    console.log("Gemini response received:", {
      status: response.sdkHttpResponse?.responseInternal?.status ?? "unavailable",
      model: response.modelVersion || getModel()
    });
    return response.text?.trim() || "";
  } finally {
    clearTimeout(timeout);
  }
}

function parseAdminPassword(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return typeof req.headers["x-admin-password"] === "string" ? req.headers["x-admin-password"] : "";
}

function requireAdmin(req, res, next) {
  const supplied = parseAdminPassword(req);
  if (!supplied || supplied !== adminPassword) {
    return res.status(401).json({ error: "Admin authentication required." });
  }
  return next();
}

function serializeRound(round) {
  return {
    ...round,
    leaderboard: buildLeaderboard(round),
    averageScores: Object.fromEntries(round.submissions.map((item) => [item.id, getAverageScore(round, item.id)]))
  };
}

app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: getModel()
  });
});

app.get("/api/competition", (req, res) => {
  const store = readCompetitionStore();
  const round = getCurrentRound(store);
  res.json({ ok: true, state: round.state, competition: { ...store, currentRound: serializeRound(round) } });
});

app.post("/api/submissions", (req, res) => {
  try {
    const store = readCompetitionStore();
    const participantName = typeof req.body?.participantName === "string" ? req.body.participantName.trim() : "";
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const resultText = typeof req.body?.resultText === "string" ? req.body.resultText.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const theme = typeof req.body?.theme === "string" ? req.body.theme.trim() : "";

    if (!participantName || !prompt || !resultText) {
      return res.status(400).json({ error: "Participant name, prompt, and result text are required." });
    }

    const round = getCurrentRound(store);
    if (round.state !== "SUBMISSIONS_OPEN") {
      return res.status(409).json({ error: "Submissions are currently closed." });
    }

    const submission = createSubmission(store, { participantName, prompt, resultText });
    if (title) submission.title = title;
    if (theme) submission.theme = theme;
    persistCompetitionStore(store);
    return res.status(201).json({ ok: true, submission, round: serializeRound(round) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create submission." });
  }
});

app.post("/api/votes", (req, res) => {
  try {
    const store = readCompetitionStore();
    const submissionId = typeof req.body?.submissionId === "string" ? req.body.submissionId : "";
    const voterSession = typeof req.body?.voterSession === "string" ? req.body.voterSession.trim() : "";
    const participantName = typeof req.body?.participantName === "string" ? req.body.participantName.trim() : "";
    const ratings = req.body?.ratings && typeof req.body.ratings === "object" ? req.body.ratings : {};

    const vote = createVote(store, { submissionId, voterSession, participantName, ratings });
    persistCompetitionStore(store);
    return res.status(201).json({ ok: true, vote, round: serializeRound(getCurrentRound(store)) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to save vote." });
  }
});

app.post("/api/test-gemini", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  console.log("Gemini test request:", {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: getModel(),
    promptLength: prompt.length
  });
  if (!prompt) return res.status(400).json({ error: "A prompt is required." });
  if (prompt.length > 700) return res.status(400).json({ error: "The prompt is too long." });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: "Gemini is not configured on the server." });
  }

  try {
    const text = await generateGeminiText(prompt, { maxOutputTokens: 100 });
    if (!text) return res.status(502).json({ error: "Gemini returned an empty response." });
    return res.json({ text });
  } catch (error) {
    const details = geminiErrorDetails(error);
    console.error("Gemini test failed:", details);
    if (error && typeof error === "object" && error.code === "MISSING_API_KEY") {
      return res.status(503).json({ error: "Gemini is not configured on the server." });
    }
    const result = errorResponse(error);
    return res.status(result.status).json({ error: result.error });
  }
});

app.post("/api/generate-story", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const theme = typeof req.body?.theme === "string" ? req.body.theme.trim() : "";
  const regenerate = req.body?.regenerate === true;
  const previousStory = typeof req.body?.previousStory === "string" ? req.body.previousStory.trim() : "";
  console.log("Gemini story request:", {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: getModel(),
    promptLength: prompt.length,
    themeLength: theme.length,
    regenerate
  });

  if (!prompt || !theme) {
    return res.status(400).json({ error: "A prompt and challenge are required." });
  }
  if (prompt.length > 700 || theme.length > 300 || previousStory.length > 3_000) {
    return res.status(400).json({ error: "The prompt or challenge is too long." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Gemini is not configured on the server."
    });
  }

  try {
    const detailedPrompt = `You are a witty Singaporean comedian and professional short-story writer crafting a funny story for a general audience. Keep the humour natural, playful, and distinctly Singaporean without forcing slang into every sentence. Use Singaporean flavour only where it fits naturally: family dynamics, hawker-centre energy, MRT moments, HDB life, queue culture, kopitiam situations, and reactions like "wah", "aiyo", "jialat", "siao", or "can lah". But do not randomly add Singaporean offices, WhatsApp groups, management meetings, overtime, or workplace stories unless the user's idea clearly calls for them.

The user's original premise must remain the core of the story. The idea is the foundation. Keep the main elements recognisable and central to the story. The Singaporean humour should enhance the premise, not replace it.

Write a complete mini-story that feels like a sharp, funny Singaporean storyteller performing for a broad audience. Use a clear hook, quick setup, build-up, escalation, twist, and punchline. Build the comedy from the original premise itself through misunderstandings, literal interpretations, awkward consequences, character contrast, escalation, irony, and a surprising but logical ending. Keep the characters consistent and give them personalities that help the humour. Make the events feel connected and logical rather than random.

Your response must be no more than 200 words. Aim for around 150-190 words so there is enough room for a proper story while staying safely under the limit. The story must be a final polished result only. Do not include a title, preface, commentary, explanation, bullet points, or any extra text.

USER'S STORY IDEA:
${prompt}

Turn this idea into a funny, coherent story. Keep the premise recognisable, escalate the comedy naturally, and end with a memorable punchline. Return only the finished story.`;

    const text = await generateGeminiText(detailedPrompt, {
      systemInstruction: "You are a witty Singaporean comedian and professional short-story writer. Keep the story funny, coherent, and grounded in the user's original premise. Use natural Singaporean flavour where it fits, but never dilute or replace the user's idea with unrelated settings. Return only the finished story, with no title, commentary, explanation, or extra text. Keep the final story at 200 words or fewer.",
      temperature: 1,
      thinkingConfig: { thinkingLevel: "low" },
      maxOutputTokens: 2_000
    });
    if (!text) {
      console.error("Gemini returned no story text.");
      return res.status(502).json({ error: "Gemini returned an empty response." });
    }

    return res.json({ text });
  } catch (error) {
    const details = geminiErrorDetails(error);
    console.error("Gemini story request failed:", details);
    const result = errorResponse(error);
    return res.status(result.status).json({ error: result.error });
  }
});

app.get("/api/admin/competition", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  const round = getCurrentRound(store);
  res.json({ ok: true, adminPasswordConfigured: Boolean(adminPassword), competition: { ...store, currentRound: serializeRound(round) } });
});

app.post("/api/admin/state", requireAdmin, (req, res) => {
  const nextState = typeof req.body?.state === "string" ? req.body.state : "WAITING";
  const store = readCompetitionStore();
  const round = setCompetitionState(store, nextState);
  persistCompetitionStore(store);
  res.json({ ok: true, state: round.state, currentRound: serializeRound(round) });
});

app.post("/api/admin/start-voting", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  setCompetitionState(store, "VOTING");
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(getCurrentRound(store)) });
});

app.post("/api/admin/end-voting", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  setCompetitionState(store, "RESULTS");
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(getCurrentRound(store)) });
});

app.post("/api/admin/start-submissions", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  setCompetitionState(store, "SUBMISSIONS_OPEN");
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(getCurrentRound(store)) });
});

app.post("/api/admin/close-submissions", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  setCompetitionState(store, "SUBMISSIONS_CLOSED");
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(getCurrentRound(store)) });
});

app.post("/api/admin/reset-votes", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  const round = resetVotes(store);
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(round) });
});

app.post("/api/admin/delete-submission/:submissionId", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  const deleted = deleteSubmission(store, req.params.submissionId);
  persistCompetitionStore(store);
  res.json({ ok: true, deleted, currentRound: serializeRound(getCurrentRound(store)) });
});

app.post("/api/admin/delete-all-submissions", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  const round = deleteAllSubmissions(store);
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(round) });
});

app.post("/api/admin/reset-competition", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  const current = resetCompetition(store);
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(current), reset: true });
});

app.post("/api/admin/start-new-round", requireAdmin, (req, res) => {
  const store = readCompetitionStore();
  const round = startNewRound(store, req.body?.title || "Prompt Olympics");
  persistCompetitionStore(store);
  res.json({ ok: true, currentRound: serializeRound(round), competition: { ...store, currentRound: serializeRound(round) } });
});

app.use(express.static(distPath));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.get("/*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
  console.log("Gemini configuration:", { geminiConfigured: Boolean(process.env.GEMINI_API_KEY), model: getModel() });
});
