import { z } from "zod";
import { ApiError, error, json, user } from "@/lib/server";
import { actionById } from "@/lib/action-store";
import { readConfig } from "@/lib/sap";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await user();
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const action = await actionById(id);
    if (!action || action.game !== readConfig()?.game)
      throw new ApiError(404, "Vorgang nicht gefunden.");
    return json(action);
  } catch (e) {
    return error(e);
  }
}
