import { ApiError, body, db, error, json, user } from "@/lib/server";
import {
  draftSchema,
  gameSchema,
  kindSchema,
  validateDraft,
} from "@/lib/validation";
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  try {
    const identity = await user();
    const { kind } = await context.params;
    kindSchema.parse(kind);
    const game = gameSchema.parse(
      new URL(request.url).searchParams.get("game"),
    );
    const row = await db()
      .prepare(
        "SELECT payload,version,base_version FROM drafts WHERE user_id=? AND game=? AND kind=?",
      )
      .bind(identity.userId, game, kind)
      .first<{ payload: string; version: number; base_version: string }>();
    return json(
      row
        ? {
            payload: JSON.parse(row.payload),
            version: row.version,
            baseVersion: row.base_version,
          }
        : { payload: null, version: 0 },
    );
  } catch (e) {
    return error(e);
  }
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  try {
    const identity = await user(request);
    const { kind } = await context.params;
    kindSchema.parse(kind);
    const input = draftSchema.parse(await body(request));
    const payload = validateDraft(kind, input.payload);
    const result = await db()
      .prepare(
        "INSERT INTO drafts (user_id,game,kind,payload,base_version,version,updated_at) SELECT ?,?,?,?,?,1,? WHERE ?=0 ON CONFLICT(user_id,game,kind) DO UPDATE SET payload=excluded.payload,base_version=excluded.base_version,version=drafts.version+1,updated_at=excluded.updated_at WHERE drafts.version=? RETURNING version",
      )
      .bind(
        identity.userId,
        input.game,
        kind,
        JSON.stringify(payload),
        input.baseVersion,
        new Date().toISOString(),
        input.version,
        input.version,
      )
      .first<{ version: number }>();
    // Existing rows need an upsert input even when the initial INSERT predicate is false.
    if (!result && input.version > 0) {
      const updated = await db()
        .prepare(
          "UPDATE drafts SET payload=?,base_version=?,version=version+1,updated_at=? WHERE user_id=? AND game=? AND kind=? AND version=? RETURNING version",
        )
        .bind(
          JSON.stringify(payload),
          input.baseVersion,
          new Date().toISOString(),
          identity.userId,
          input.game,
          kind,
          input.version,
        )
        .first<{ version: number }>();
      if (updated) return json(updated);
    }
    if (!result)
      throw new ApiError(
        409,
        "Dieser Entwurf wurde in einem anderen Fenster geändert. Deine Eingaben bleiben erhalten; lade den anderen Stand separat, bevor du ihn zusammenführst.",
      );
    return json(result);
  } catch (e) {
    return error(e);
  }
}
