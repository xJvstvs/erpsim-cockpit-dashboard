import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  if (!env.DB)
    throw new ApiError(
      503,
      "Der gemeinsame Speicher ist noch nicht eingerichtet. Deine Eingaben bleiben erhalten.",
    );
  return env.DB;
}
export function secret(key: string) {
  return (
    (env as unknown as Record<string, string | undefined>)[key] ??
    process.env[key]
  );
}
export async function user(request?: Request) {
  const identity = await getChatGPTUser();
  if (!identity) throw new ApiError(401, "Bitte erneut anmelden.");
  const members = secret("TEAM_EMAILS")
    ?.split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (members?.length && !members.includes(identity.email.toLowerCase()))
    throw new ApiError(
      403,
      "Dieser Zugang ist nicht für das Team freigeschaltet.",
    );
  if (request && !["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      throw new ApiError(403, "Ungültiger Anforderungsursprung.");
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ApiError(415, "JSON wird erwartet.");
  }
  return identity;
}
export async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 100000) throw new ApiError(413, "Die Eingabe ist zu groß.");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError(400, "Die Eingabe ist kein gültiges JSON.");
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function error(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  if (e && typeof e === "object" && "issues" in e)
    return json({ error: "Bitte Eingaben, Mengen und Einheiten prüfen." }, 400);
  console.error(
    "Request failed:",
    e instanceof Error ? e.name : "UnknownError",
  );
  return json(
    {
      error:
        "Der Vorgang konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten.",
    },
    503,
  );
}
export async function audit(userId: string, event: string, detail: unknown) {
  await db()
    .prepare(
      "INSERT INTO audits (id,user_id,event,detail,at) VALUES (?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      userId,
      event,
      JSON.stringify(detail),
      new Date().toISOString(),
    )
    .run();
}
