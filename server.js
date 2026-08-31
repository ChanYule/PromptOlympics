import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

app.use(express.json({ limit: "20kb" }));

app.post("/api/generate-story", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const theme = typeof req.body?.theme === "string" ? req.body.theme.trim() : "";
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!prompt || !theme) {
    return res.status(400).json({ error: "A prompt and challenge are required." });
  }
  if (prompt.length > 700 || theme.length > 300) {
    return res.status(400).json({ error: "The prompt or challenge is too long." });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: "Story generation is not configured yet. Add GEMINI_API_KEY to the server environment."
    });
  }

  try {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const googleResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You write safe, playful, all-ages comedy stories. Follow the user's creative request while keeping the story suitable for a public website." }]
          },
          contents: [{
            role: "user",
            parts: [{ text: `Challenge: ${theme}\n\nUser prompt: ${prompt}\n\nWrite one original, funny short story of at most 200 words. Give it a clear ending and punchline. Return only the story, with no title, preface, or markdown.` }]
          }],
          generationConfig: {
            temperature: 1,
            maxOutputTokens: 450
          }
        })
      }
    );

    const data = await googleResponse.json();
    if (!googleResponse.ok) {
      console.error("Gemini generation failed:", googleResponse.status, data?.error?.message);
      return res.status(502).json({ error: "The story AI could not generate a story. Please try again." });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text) {
      console.error("Gemini returned no text:", JSON.stringify(data));
      return res.status(502).json({ error: "The story AI returned an empty response. Please try again." });
    }

    return res.json({ text });
  } catch (error) {
    console.error("Gemini request error:", error);
    return res.status(502).json({ error: "Unable to reach the story AI. Please try again." });
  }
});

app.use(express.static(distPath));

app.get("/*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
