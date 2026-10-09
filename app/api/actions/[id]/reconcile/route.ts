import { z } from "zod";
import { ApiError, audit, body, error, json, user } from "@/lib/server";
import { actionById, actionStore } from "@/lib/action-store";
import { reconcileAction } from "@/lib/action-engine";
import { actionAdapter } from "@/lib/sap-actions";
import { readConfig } from "@/lib/sap";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await user(request);
    z.object({})
      .strict()
      .parse(await body(request));
    const id = z
        .string()
        .uuid()
        .parse((await context.params).id),
      action = await actionById(id);
    if (!action || action.game !== readConfig()?.game)
      throw new ApiError(404, "Vorgang nicht gefunden.");
    const adapter = actionAdapter(action.kind);
    if (!adapter)
      throw new ApiError(
        501,
        "Der geprüfte SAP-Abgleich ist noch nicht eingerichtet.",
      );
    const result = await reconcileAction(action, actionStore, adapter);
    await audit(identity.userId, "action.reconcile", {
      id,
      status: result.status,
    });
    return json(result);
  } catch (e) {
    return error(e);
  }
}
