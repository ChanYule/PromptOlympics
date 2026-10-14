import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server.js";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "po-browser-"));
const service = createApp({
  env: {
    NODE_ENV: "test",
    STORAGE_MODE: "local",
    LOCAL_DATA_PATH: path.join(directory, "state.json"),
    AI_MODE: "mock",
    SESSION_SECRET: "browser-test-secret-with-32-characters",
    ADMIN_PASSWORD: "browser-test-password-16",
    MAX_STORIES_PER_PARTICIPANT: "10",
  },
});
const server = service.app.listen(10001, "127.0.0.1");
function stop() {
  service.stop();
  server.close(() => {
    fs.rmSync(directory, { recursive: true });
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
