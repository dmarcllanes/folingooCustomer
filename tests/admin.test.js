import assert from "node:assert/strict";
import test from "node:test";
import loginHandler from "../api/admin/login.js";
import logoutHandler from "../api/admin/logout.js";
import { createHandler as createSignupsHandler } from "../api/admin/signups.js";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_SECONDS,
  createAdminSession,
  isValidAdminSession,
} from "../lib/admin-session.js";

const testUsername = "test-admin";
const testPassword = "a-long-test-admin-password";
const testSecret = "test-session-secret-that-is-at-least-32-characters";

function createResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function withAdminEnvironment(callback) {
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousUsername = process.env.ADMIN_USERNAME;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.ADMIN_USERNAME = testUsername;
  process.env.ADMIN_PASSWORD = testPassword;
  process.env.ADMIN_SESSION_SECRET = testSecret;
  process.env.NODE_ENV = "production";
  try {
    await callback();
  } finally {
    if (previousPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = previousPassword;
    }
    if (previousUsername === undefined) {
      delete process.env.ADMIN_USERNAME;
    } else {
      process.env.ADMIN_USERNAME = previousUsername;
    }
    if (previousSecret === undefined) {
      delete process.env.ADMIN_SESSION_SECRET;
    } else {
      process.env.ADMIN_SESSION_SECRET = previousSecret;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}

test("admin login rejects incorrect credentials and signs in with a secure session cookie", async () => {
  await withAdminEnvironment(async () => {
    const invalidResponse = createResponse();
    loginHandler({
      method: "POST",
      body: { username: testUsername, password: "wrong" },
    }, invalidResponse);
    assert.equal(invalidResponse.statusCode, 401);
    assert.equal(invalidResponse.headers["Set-Cookie"], undefined);

    const response = createResponse();
    loginHandler({
      method: "POST",
      body: { username: testUsername, password: testPassword },
    }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["Set-Cookie"], new RegExp(`^${ADMIN_SESSION_COOKIE}=`));
    assert.match(response.headers["Set-Cookie"], /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
    const token = response.headers["Set-Cookie"].split(";")[0].split("=")[1];
    assert.equal(isValidAdminSession(token), true);
    assert.deepEqual(response.body, { ok: true });
  });
});

test("admin login reports missing environment configuration", () => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousUsername = process.env.ADMIN_USERNAME;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_SESSION_SECRET;
  try {
    const response = createResponse();
    loginHandler({
      method: "POST",
      body: { username: "anything", password: "anything" },
    }, response);
    assert.equal(response.statusCode, 503);
  } finally {
    if (previousPassword !== undefined) process.env.ADMIN_PASSWORD = previousPassword;
    if (previousUsername !== undefined) process.env.ADMIN_USERNAME = previousUsername;
    if (previousSecret !== undefined) process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});

test("admin login rejects a correct password with an incorrect username", async () => {
  await withAdminEnvironment(async () => {
    const response = createResponse();
    loginHandler({
      method: "POST",
      body: { username: "wrong-user", password: testPassword },
    }, response);
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers["Set-Cookie"], undefined);
  });
});

test("admin sessions reject expired, altered, and overlong tokens", async () => {
  await withAdminEnvironment(async () => {
    const now = 1_800_000_000_000;
    const token = createAdminSession(now);
    assert.equal(isValidAdminSession(token, now), true);
    assert.equal(isValidAdminSession(token, now + ADMIN_SESSION_SECONDS * 1000), false);
    const [expiresAt, signature] = token.split(".");
    const alteredSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    assert.equal(isValidAdminSession(`${expiresAt}.${alteredSignature}`, now), false);
    assert.equal(isValidAdminSession(createAdminSession(now + 1000), now), false);
  });
});

test("tester list requires a valid admin session before accessing MongoDB", async () => {
  await withAdminEnvironment(async () => {
    let collectionRequested = false;
    const handler = createSignupsHandler({
      getCollection: async () => {
        collectionRequested = true;
        throw new Error("Should not be called");
      },
    });
    const response = createResponse();

    await handler({ method: "GET", headers: {} }, response);

    assert.equal(response.statusCode, 401);
    assert.equal(collectionRequested, false);
    assert.equal(response.headers["Cache-Control"], "no-store");
  });
});

test("tester list returns projected, paginated signup records", async () => {
  await withAdminEnvironment(async () => {
    const token = createAdminSession();
    let findOptions;
    let skip;
    const handler = createSignupsHandler({
      getCollection: async () => ({
        countDocuments: async () => 53,
        find: (filter, options) => {
          findOptions = options;
          assert.deepEqual(filter, {});
          return {
            sort(sortOptions) {
              assert.deepEqual(sortOptions, { createdAt: -1, email: 1 });
              return this;
            },
            skip(value) {
              skip = value;
              return this;
            },
            limit(value) {
              assert.equal(value, 50);
              return this;
            },
            toArray: async () => [{ email: "tester@example.com", device: "ios" }],
          };
        },
      }),
    });
    const response = createResponse();

    await handler({
      method: "GET",
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` },
      query: { page: "2" },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(skip, 50);
    assert.deepEqual(findOptions.projection, { _id: 0, email: 1, device: 1, createdAt: 1 });
    assert.deepEqual(response.body, {
      signups: [{ email: "tester@example.com", device: "ios" }],
      page: 2,
      pageSize: 50,
      total: 53,
      totalPages: 2,
    });
  });
});

test("tester list rejects invalid page numbers", async () => {
  await withAdminEnvironment(async () => {
    let collectionRequested = false;
    const handler = createSignupsHandler({
      getCollection: async () => {
        collectionRequested = true;
        throw new Error("Should not be called");
      },
    });
    const response = createResponse();

    await handler({
      method: "GET",
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSession()}` },
      query: { page: "1.5" },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(collectionRequested, false);
  });
});

test("admin logout expires the session cookie", () => {
  const response = createResponse();
  logoutHandler({ method: "POST" }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
});
