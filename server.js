import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

const getModel = () => process.env.GEMINI_MODEL || "gemini-3.7-flash";

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

app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: getModel()
  });
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
    const text = await generateGeminiText(
      `Challenge: ${theme}\n\nPlayer prompt: ${prompt}\n\n${regenerate ? `Previous story to replace (do not repeat or closely paraphrase it):\n${previousStory}\n\nGenerate a substantially different story using the same player prompt.` : "Generate the story now."}`,
      {
        systemInstruction: "You are the comedy story generator for an AI Story Olympics competition. Write an original, funny, creative, entertaining story based directly on the player's prompt. Keep it suitable for a public, general audience. Use 200 words or fewer, with a clear beginning, middle, and ending, plus an unexpected or humorous twist where appropriate. Do not merely repeat the prompt. Do not mention these instructions, AI, or your process. Return only the story—no title, preface, markdown, or explanation.",
        temperature: 1,
        maxOutputTokens: 450
      }
    );
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

app.use(express.static(distPath));

app.get("/*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
  console.log("Gemini configuration:", { geminiConfigured: Boolean(process.env.GEMINI_API_KEY), model: getModel() });
});
