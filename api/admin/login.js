import {
  adminCredentialsMatch,
  createAdminSession,
  isAdminConfigured,
  setAdminSessionCookie,
} from "../../lib/admin-session.js";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ message: "Method not allowed." });
    return;
  }

  if (!isAdminConfigured()) {
    response.status(503).json({ message: "Admin access is not configured correctly." });
    return;
  }

  const { username, password } = request.body ?? {};
  if (!adminCredentialsMatch(username, password)) {
    response.status(401).json({ message: "The username or password is incorrect." });
    return;
  }

  const session = createAdminSession();
  if (!session) {
    response.status(503).json({ message: "Admin access is not configured correctly." });
    return;
  }

  setAdminSessionCookie(response, session);
  response.status(200).json({ ok: true });
}
