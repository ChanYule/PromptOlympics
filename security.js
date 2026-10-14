import {
  createHmac,
  timingSafeEqual,
  randomUUID,
  createHash,
} from "node:crypto";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function createSecurity(env) {
  const secret = env.SESSION_SECRET;
  const password = env.ADMIN_PASSWORD;
  if (!secret || secret.trim().length < 32 || secret.startsWith("REPLACE_"))
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  if (
    !password ||
    password.trim().length < 16 ||
    password === "prompt-olympics-admin" ||
    password.startsWith("REPLACE_")
  )
    throw new Error(
      "ADMIN_PASSWORD must be a private password of at least 16 characters.",
    );
  const sign = (value) =>
    createHmac("sha256", secret).update(value).digest("base64url");
  const equal = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const left = Buffer.from(a),
      right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  function issue(type, age) {
    const data = Buffer.from(
      JSON.stringify({
        id: randomUUID(),
        type,
        expires: Date.now() + age * 1000,
      }),
    ).toString("base64url");
    return `${data}.${sign(data)}`;
  }
  function read(req, type = "voter") {
    const cookies = Object.fromEntries(
      (req.headers.cookie || "").split(";").map((s) => s.trim().split("=")),
    );
    const value = cookies[type === "voter" ? "po_session" : "po_admin"];
    if (!value) return null;
    const [data, sig] = value.split(".");
    if (!equal(sig, sign(data))) return null;
    try {
      const claims = JSON.parse(Buffer.from(data, "base64url"));
      return claims.type === type && claims.expires > Date.now()
        ? claims
        : null;
    } catch {
      return null;
    }
  }
  function cookie(res, type, value, age) {
    res.append(
      "Set-Cookie",
      `${type === "voter" ? "po_session" : "po_admin"}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
  }
  function csrf(id, type = "voter") {
    return sign(`csrf:${type}:${id}`);
  }
  function validCsrf(req, id, type = "voter") {
    const origin = req.headers.origin;
    if (
      origin &&
      origin !== env.APP_ORIGIN &&
      origin !== `${req.protocol}://${req.get("host")}`
    )
      return false;
    return equal(req.headers["x-csrf-token"], csrf(id, type));
  }
  return {
    issue,
    read,
    cookie,
    csrf,
    validCsrf,
    validPassword: (supplied) =>
      equal(digest(supplied || ""), digest(password)),
  };
}
