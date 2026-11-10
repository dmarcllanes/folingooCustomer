import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "folingoo_admin_session";
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return typeof secret === "string" && Buffer.byteLength(secret) >= 32 ? secret : null;
}

export function isAdminConfigured() {
  return typeof process.env.ADMIN_USERNAME === "string"
    && process.env.ADMIN_USERNAME.length > 0
    && process.env.ADMIN_USERNAME.length <= 1024
    && typeof process.env.ADMIN_PASSWORD === "string"
    && process.env.ADMIN_PASSWORD.length > 0
    && process.env.ADMIN_PASSWORD.length <= 1024
    && getSessionSecret() !== null;
}

export function adminCredentialsMatch(username, password) {
  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (
    typeof username !== "string" ||
    username.length > 1024 ||
    typeof password !== "string" ||
    password.length > 1024 ||
    typeof configuredUsername !== "string" ||
    !configuredUsername ||
    configuredUsername.length > 1024 ||
    typeof configuredPassword !== "string" ||
    !configuredPassword ||
    configuredPassword.length > 1024
  ) {
    return false;
  }

  const usernameMatches = timingSafeEqual(
    createHash("sha256").update(username).digest(),
    createHash("sha256").update(configuredUsername).digest(),
  );
  const passwordMatches = timingSafeEqual(
    createHash("sha256").update(password).digest(),
    createHash("sha256").update(configuredPassword).digest(),
  );
  return usernameMatches && passwordMatches;
}

export function createAdminSession(now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  const expiresAt = Math.floor(now / 1000) + ADMIN_SESSION_SECONDS;
  const signature = createHmac("sha256", secret).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function isValidAdminSession(token, now = Date.now()) {
  const secret = getSessionSecret();
  if (!secret || typeof token !== "string") {
    return false;
  }

  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (
    !match ||
    Number(match[1]) <= Math.floor(now / 1000) ||
    Number(match[1]) > Math.floor(now / 1000) + ADMIN_SESSION_SECONDS
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(match[1]).digest();
  const provided = Buffer.from(match[2], "base64url");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function getAdminSession(request) {
  const cookieHeader = request.headers?.cookie;
  if (typeof cookieHeader !== "string") {
    return null;
  }

  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  if (!cookie) {
    return null;
  }

  const token = cookie.slice(ADMIN_SESSION_COOKIE.length + 1);
  return isValidAdminSession(token) ? token : null;
}

export function setAdminSessionCookie(response, token, maxAge = ADMIN_SESSION_SECONDS) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
  );
}

export function clearAdminSessionCookie(response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}
