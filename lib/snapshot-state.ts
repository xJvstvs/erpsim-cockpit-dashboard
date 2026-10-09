import type { Snapshot } from "./types";

export type DashboardState = { snapshot: Snapshot | null; warning: string | null };

/** Only a confirmed SAP snapshot may become the shared basis. */
export function confirmedSnapshot(raw: string, game: string): Snapshot | null {
  try {
    const value = JSON.parse(raw) as Snapshot;
    return value?.mode === "live" && value.game === game && typeof value.version === "string"
      && Array.isArray(value.sales) && Array.isArray(value.inventory) && Array.isArray(value.products)
      ? value : null;
  } catch { return null; }
}

export async function synchronizeSnapshot(deps: {
  cached: Snapshot | null;
  acquire(): Promise<boolean>;
  read(): Promise<Snapshot>;
  persist(snapshot: Snapshot): Promise<void>;
  markFailure(warning: string): Promise<void>;
  release(): Promise<void>;
}): Promise<DashboardState> {
  if (!await deps.acquire()) return { snapshot: deps.cached, warning: "SAP-Daten werden gerade geladen." };
  try {
    const snapshot = await deps.read();
    if (snapshot.mode !== "live") throw new Error("SAP hat keinen bestätigten Datenstand geliefert.");
    await deps.persist(snapshot);
    return { snapshot, warning: null };
  } catch (e) {
    const warning = e instanceof Error ? e.message : "SAP konnte nicht aktualisiert werden.";
    if (deps.cached) await deps.markFailure(warning);
    return { snapshot: deps.cached, warning };
  } finally { await deps.release(); }
}
