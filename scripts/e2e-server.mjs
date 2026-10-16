import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createAiService } from "../aiService.js";
import { createApp } from "../server.js";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "po-browser-"));
const env = {
  NODE_ENV: "test",
  STORAGE_MODE: "local",
  LOCAL_DATA_PATH: path.join(directory, "state.json"),
  AI_MODE: "mock",
  SESSION_SECRET: "browser-test-secret-with-32-characters",
  ADMIN_PASSWORD: "browser-test-password-16",
  MAX_STORIES_PER_PARTICIPANT: "10",
};
const original = createAiService(env);
const samples = [
  [
    /cat.*principal/i,
    {
      title: "Principal Paws",
      text: "The new principal was a cat. He replaced detention with naps and demanded tuna in the staff room. When inspectors asked about school discipline, he pointed proudly at every child sitting quietly. Then a tiny red laser dot crossed the floor. The principal abandoned the inspection, chased it through three classrooms and crashed into the trophy cabinet. His report described him as highly motivated, easily distracted, and outstanding at pursuing new opportunities.",
    },
  ],
  [
    /uncle.*K-pop/i,
    {
      title: "The Dancing Uncle",
      text: "Uncle joined a K-pop audition while looking for the clinic upstairs. His knee exercises matched the music perfectly. The judges called his careful stretches a revolutionary dance style. By lunchtime, thousands of fans were copying his shoulder rolls. Asked to explain his creative process, Uncle held up a queue ticket and said he was simply warming up. His debut album sold out immediately. The title was Please Call Number Forty Two.",
    },
  ],
  [
    /chicken.*restaurant/i,
    {
      title: "Chef Chicken",
      text: "A chicken opened a fancy restaurant and hired a fox as the waiter. Every customer praised the tiny portions until a food critic ordered the signature dish. The chicken emerged with a magnificent silver tray, lifted the lid, and revealed one grain of rice. The critic declared it minimalist genius and awarded five stars. Delighted, the chicken raised the price. The fox asked about dessert. The chicken pointed at the bill and said the surprise was already included.",
    },
  ],
];
const ai = {
  ...original,
  async generate(input) {
    return (
      samples.find(([pattern]) => pattern.test(input.prompt))?.[1] ||
      original.generate(input)
    );
  },
};
let service = createApp({ env, ai });
const server = http
  .createServer(async (req, res) => {
    if (
      ["/__test/restart", "/__test/fresh"].includes(req.url) &&
      req.method === "POST"
    ) {
      service.stop();
      if (req.url === "/__test/fresh")
        fs.rmSync(path.join(directory, "state.json"), { force: true });
      service = createApp({ env, ai });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    service.app(req, res);
  })
  .listen(10001, "127.0.0.1");
function stop() {
  service.stop();
  server.close(() => {
    fs.rmSync(directory, { recursive: true });
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
