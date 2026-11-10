import { getAdminSession } from "../../lib/admin-session.js";
import { getBetaSignupsCollection } from "../../lib/mongodb.js";

const PAGE_SIZE = 50;

export function createHandler({ getCollection = getBetaSignupsCollection } = {}) {
  return async function handler(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");

    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      response.status(405).json({ message: "Method not allowed." });
      return;
    }

    if (!getAdminSession(request)) {
      response.status(401).json({ message: "Please sign in to view beta testers." });
      return;
    }

    const rawPage = request.query?.page ?? "1";
    const page = typeof rawPage === "string" && /^\d+$/.test(rawPage) ? Number(rawPage) : NaN;
    if (!Number.isSafeInteger(page) || page < 1 || page > Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)) {
      response.status(400).json({ message: "Invalid page number." });
      return;
    }

    try {
      const collection = await getCollection();
      const [total, signups] = await Promise.all([
        collection.countDocuments(),
        collection.find({}, {
          projection: { _id: 0, email: 1, device: 1, createdAt: 1 },
        })
          .sort({ createdAt: -1, email: 1 })
          .skip((page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .toArray(),
      ]);

      response.status(200).json({
        signups,
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      });
    } catch (error) {
      console.error("Beta signup list could not be loaded.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      response.status(503).json({ message: "The tester list is temporarily unavailable." });
    }
  };
}

export default createHandler();
