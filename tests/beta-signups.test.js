import assert from "node:assert/strict";
import test from "node:test";
import { createHandler, parseSignup } from "../api/beta-signups.js";

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

test("parseSignup normalizes email and accepts a supported device", () => {
  assert.deepEqual(parseSignup({
    email: "  TEST@Example.com ",
    device: "ios",
    contactConsent: "yes",
  }), {
    signup: { email: "test@example.com", device: "ios" },
  });
});

test("parseSignup rejects invalid email, unsupported device, and missing consent", () => {
  assert.match(parseSignup({
    email: "not-an-email",
    device: "ios",
    contactConsent: "yes",
  }).error, /valid email/);
  assert.match(parseSignup({
    email: "test@example.com",
    device: "other",
    contactConsent: "yes",
  }).error, /choose iOS or Android/);
  assert.match(parseSignup({
    email: "test@example.com",
    device: "android",
  }).error, /agree/);
});

test("handler stores only the signup details and returns success", async () => {
  let update;
  const handler = createHandler({
    getCollection: async () => ({
      updateOne: async (...args) => {
        update = args;
        return { upsertedCount: 1 };
      },
    }),
  });
  const response = createResponse();

  await handler({
    method: "POST",
    body: { email: "TEST@example.com", device: "android", contactConsent: "yes" },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(update[0], { email: "test@example.com" });
  assert.equal(update[1].$set.device, "android");
  assert.equal(update[1].$setOnInsert.email, "test@example.com");
  assert.ok(update[1].$setOnInsert.createdAt instanceof Date);
  assert.deepEqual(response.body, { ok: true });
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("handler updates the device for an email already on the beta list", async () => {
  let update;
  const handler = createHandler({
    getCollection: async () => ({
      updateOne: async (...args) => {
        update = args;
        return { matchedCount: 1, upsertedCount: 0 };
      },
    }),
  });
  const response = createResponse();

  await handler({
    method: "POST",
    body: { email: "test@example.com", device: "android", contactConsent: "yes" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(update[0], { email: "test@example.com" });
  assert.deepEqual(update[1].$set, { device: "android" });
  assert.ok(update[1].$setOnInsert.createdAt instanceof Date);
  assert.equal(update[2].upsert, true);
});

test("handler rejects invalid requests without accessing MongoDB", async () => {
  let collectionRequested = false;
  const handler = createHandler({
    getCollection: async () => {
      collectionRequested = true;
      throw new Error("Should not be called");
    },
  });
  const response = createResponse();

  await handler({ method: "POST", body: { email: "invalid" } }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /valid email/);
  assert.equal(collectionRequested, false);
});

test("handler rejects unsupported methods", async () => {
  const handler = createHandler();
  const response = createResponse();

  await handler({ method: "GET" }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "POST");
});

test("handler reports storage errors without exposing details", async (context) => {
  const originalError = console.error;
  let logged;
  console.error = (...args) => {
    logged = args;
  };
  context.after(() => {
    console.error = originalError;
  });

  const handler = createHandler({
    getCollection: async () => {
      throw new Error("sensitive connection information");
    },
  });
  const response = createResponse();

  await handler({
    method: "POST",
    body: { email: "test@example.com", device: "ios", contactConsent: "yes" },
  }, response);

  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(response.body), /sensitive connection information/);
  assert.deepEqual(logged[1], { errorName: "Error" });
});
