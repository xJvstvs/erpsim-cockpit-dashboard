import { z } from "zod";
import { ApiError, body, error, json, user } from "@/lib/server";
import {
  canonical,
  gameSchema,
  kindSchema,
  validateAction,
} from "@/lib/validation";
import { dashboardSnapshot } from "@/lib/sync";
import { actionAdapter } from "@/lib/sap-actions";
import { actionStore, recentActions } from "@/lib/action-store";
import { ActionError, submitAction, type Action } from "@/lib/action-engine";
export async function GET(request: Request) {
  try {
    await user();
    const game = gameSchema.parse(
      new URL(request.url).searchParams.get("game"),
    );
    return json({ actions: await recentActions(game) });
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    const identity = await user(request);
    const input = z
      .object({
        game: gameSchema,
        kind: kindSchema,
        baseVersion: z.string().min(1).max(100),
        payload: z.unknown(),
      })
      .strict()
      .parse(await body(request));
    const key = z.string().uuid().parse(request.headers.get("Idempotency-Key"));
    const payload = validateAction(input.kind, input.payload);
    const { snapshot } = await dashboardSnapshot();
    if (!snapshot || snapshot.mode !== "live" || snapshot.game !== input.game)
      throw new ApiError(
        409,
        "SAP-Aktionen benötigen einen bestätigten Live-Datenstand der aktiven Spielinstanz.",
      );
    const adapter = actionAdapter(input.kind);
    if (!adapter)
      throw new ApiError(
        501,
        "Für diese Aktion fehlt ein verifizierter SAP-Endpunkt. Der Entwurf bleibt gespeichert.",
      );
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        canonical({ game: input.game, kind: input.kind, payload }),
      ),
    );
    const hash = [...new Uint8Array(digest)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const now = new Date().toISOString();
    const action: Action = {
      id: crypto.randomUUID(),
      userId: identity.userId,
      userName: identity.displayName,
      game: input.game,
      company: snapshot.company,
      kind: input.kind,
      idempotency: key,
      hash,
      baseVersion: input.baseVersion,
      payload,
      status: "queued",
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = await submitAction(
      action,
      snapshot.version,
      actionStore,
      adapter,
    );
    return json(result, 202);
  } catch (e) {
    if (e instanceof ActionError) return json({ error: e.message }, e.status);
    return error(e);
  }
}
