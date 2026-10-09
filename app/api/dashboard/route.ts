import { error, json, user } from "@/lib/server";
import { dashboardSnapshot } from "@/lib/sync";
export async function GET() {
  try {
    await user();
    return json(await dashboardSnapshot());
  } catch (e) {
    return error(e);
  }
}
