import { MongoClient } from "mongodb";

let clientPromise;
let indexPromise;

async function getBetaSignupsCollection() {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB;

  if (!uri || !databaseName) {
    throw new Error("Missing MongoDB configuration.");
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }

  const client = await clientPromise;
  const collection = client.db(databaseName).collection("beta_signups");

  if (!indexPromise) {
    indexPromise = collection.createIndex({ email: 1 }, { unique: true }).catch((error) => {
      indexPromise = undefined;
      throw error;
    });
  }

  await indexPromise;
  return collection;
}

export function parseSignup(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Please enter a valid email address and choose a device." };
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const device = body.device;
  const contactConsent = body.contactConsent === true || body.contactConsent === "yes";

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.includes("..")
  ) {
    return { error: "Please enter a valid email address." };
  }

  if (device !== "ios" && device !== "android") {
    return { error: "Please choose iOS or Android." };
  }

  if (!contactConsent) {
    return { error: "Please agree to receive beta access instructions by email." };
  }

  return { signup: { email, device } };
}

export function createHandler({ getCollection = getBetaSignupsCollection } = {}) {
  return async function handler(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");

    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      response.status(405).json({ message: "Method not allowed." });
      return;
    }

    const parsed = parseSignup(request.body);
    if (parsed.error) {
      response.status(400).json({ message: parsed.error });
      return;
    }

    try {
      const collection = await getCollection();
      const signup = parsed.signup;
      let result;

      try {
        result = await collection.updateOne(
          { email: signup.email },
          {
            $set: { device: signup.device },
            $setOnInsert: { email: signup.email, createdAt: new Date() },
          },
          { upsert: true },
        );
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }

        result = await collection.updateOne(
          { email: signup.email },
          { $set: { device: signup.device } },
        );
      }

      response.status(result.upsertedCount ? 201 : 200).json({ ok: true });
    } catch (error) {
      console.error("Beta signup could not be saved.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      response.status(503).json({
        message: "We couldn’t save your request right now. Please try again later.",
      });
    }
  };
}

export default createHandler();
