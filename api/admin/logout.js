import { clearAdminSessionCookie } from "../../lib/admin-session.js";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ message: "Method not allowed." });
    return;
  }

  clearAdminSessionCookie(response);
  response.status(200).json({ ok: true });
}
