import { ApiError, audit, error, json, user } from "@/lib/server";
import { inspectMetadata } from "@/lib/sap";
export async function POST(request: Request) {
  try {
    const identity = await user(request);
    const result = await inspectMetadata();
    await audit(identity.userId, "connection.audit", {
      entities: result.entities,
      status: "ok",
    });
    return json(result);
  } catch (e) {
    if (e instanceof ApiError) return json({ status: e.message }, e.status);
    return error(e);
  }
}
