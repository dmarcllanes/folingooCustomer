import { MongoClient } from "mongodb";

let clientPromise;
let indexPromise;

export async function getBetaSignupsCollection() {
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
