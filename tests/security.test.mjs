import test from "node:test";
import assert from "node:assert/strict";
import { createSecurity } from "../security.js";
test("known placeholders and malformed cookie signatures fail safely", () => {
  const env = {
    ADMIN_PASSWORD: "private-test-password-with-16-characters",
    SESSION_SECRET: "private-test-session-secret-with-32-characters",
  };
  assert.throws(() =>
    createSecurity({
      ...env,
      ADMIN_PASSWORD:
        "REPLACE_WITH_A_PRIVATE_PASSWORD_OF_AT_LEAST_16_CHARACTERS",
    }),
  );
  assert.throws(() =>
    createSecurity({
      ...env,
      SESSION_SECRET: "REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS",
    }),
  );
  const security = createSecurity(env),
    token = security.issue("voter", 100);
  assert.ok(security.read({ headers: { cookie: "po_session=" + token } }));
  const [data] = token.split(".");
  assert.equal(
    security.read({
      headers: { cookie: "po_session=" + data + "." + "é".repeat(43) },
    }),
    null,
  );
  assert.equal(
    security.read({ headers: { cookie: "po_session=malformed" } }),
    null,
  );
});
