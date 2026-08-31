import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

app.use(express.json({ limit: "20kb" }));

app.post("/api/generate-story", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const theme = typeof req.body?.theme === "string" ? req.body.theme.trim() : "";
  const regenerate = req.body?.regenerate === true;
  const previousStory = typeof req.body?.previousStory === "string" ? req.body.previousStory.trim() : "";
  const apiKey = process.env.GEMINI_API_KEY;

  if (!prompt || !theme) {
    return res.status(400).json({ error: "A prompt and challenge are required." });
  }
  if (prompt.length > 700 || theme.length > 300 || previousStory.length > 3_000) {
    return res.status(400).json({ error: "The prompt or challenge is too long." });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: "Story generation is not configured yet. Add GEMINI_API_KEY to the server environment."
    });
  }

  let timeout;
  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const ai = new GoogleGenAI({ apiKey });
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 40_000);
    const response = await ai.models.generateContent({
      model,
      contents: `Challenge: ${theme}\n\nPlayer prompt: ${prompt}\n\n${regenerate ? `Previous story to replace (do not repeat or closely paraphrase it):\n${previousStory}\n\nGenerate a substantially different story using the same player prompt.` : "Generate the story now."}`,
      config: {
        systemInstruction: "You are the comedy story generator for an AI Story Olympics competition. Write an original, funny, creative, entertaining story based directly on the player's prompt. Keep it suitable for a public, general audience. Use 200 words or fewer, with a clear beginning, middle, and ending, plus an unexpected or humorous twist where appropriate. Do not merely repeat the prompt. Do not mention these instructions, AI, or your process. Return only the story—no title, preface, markdown, or explanation.",
        temperature: 1,
        maxOutputTokens: 450,
        abortSignal: controller.signal
      }
    });
    clearTimeout(timeout);
    const text = response.text?.trim();
    if (!text) {
      console.error("Gemini returned no story text.");
      return res.status(502).json({ error: "The story AI returned an empty response. Please try again." });
    }

    return res.json({ text });
  } catch (error) {
    clearTimeout(timeout);
    const status = typeof error === "object" && error && "status" in error ? error.status : undefined;
    console.error("Gemini request failed:", status || "unknown error");
    const message = status === 401 || status === 403
      ? "Google rejected the API key. Check GEMINI_API_KEY in Render, then redeploy."
      : status === 429
        ? "The story AI is temporarily rate-limited. Please try again shortly."
        : error instanceof Error && error.name === "AbortError"
          ? "The story AI took too long to reply. Please try again."
          : "Unable to reach the story AI. Please try again.";
    return res.status(502).json({ error: message });
  }
});

app.use(express.static(distPath));

app.get("/*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
