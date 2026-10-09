import { db, secret } from "./server";
import { inspectMetadata, readConfig, readEntity } from "./sap";
import { normalise } from "./normalise";
import { confirmedSnapshot, synchronizeSnapshot, type DashboardState } from "./snapshot-state";
import { canonical } from "./validation";
export async function dashboardSnapshot(): Promise<DashboardState> {
  const config = readConfig();
  if (!config) return { snapshot: null, warning: "Die SAP-Lesekonfiguration ist noch nicht eingerichtet." };
  if (!(secret("SAP_TOKEN") || (secret("SAP_USERNAME") && secret("SAP_PASSWORD"))))
    return { snapshot: null, warning: "Die geschützte SAP-Anmeldung ist noch nicht eingerichtet." };
  const store = db();
  const cached = await store
    .prepare("SELECT payload,fetched_at,warning FROM snapshots WHERE game=?")
    .bind(config.game)
    .first<{ payload: string; fetched_at: number; warning: string | null }>();
  const confirmed = cached ? confirmedSnapshot(cached.payload, config.game) : null;
  if (cached && confirmed && Date.now() - cached.fetched_at < 15000)
    return { snapshot: confirmed, warning: cached.warning };
  const owner = crypto.randomUUID();
  return synchronizeSnapshot({
    cached: confirmed,
    acquire: async () => !!await store
    .prepare(
      "INSERT INTO locks (scope,owner,expires_at) VALUES (?,?,?) ON CONFLICT(scope) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE locks.expires_at<? RETURNING owner",
    )
    .bind(`sync:${config.game}`, owner, Date.now() + 60000, Date.now())
    .first<{ owner: string }>(),
    read: async () => {
    const catalog = await inspectMetadata();
    const entries = await Promise.allSettled(
      Object.keys(config.entities).map(
        async (name) =>
          [name, await readEntity(config, name, catalog.entities)] as const,
      ),
    );
    const sources: Record<string, import("./sap").SapRow[]> = {};
    const failures: string[] = [];
    for (const result of entries) {
      if (result.status === "fulfilled")
        sources[result.value[0]] = result.value[1];
      else
        failures.push(
          result.reason instanceof Error
            ? result.reason.message
            : "Eine Datenquelle ist ausgefallen",
        );
    }
    // Never commit a partial set as a new complete shared basis. Retain the last consistent snapshot.
    if (failures.length) throw new Error(failures.join(" · "));
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical({ config, sources })),
    );
    const version = [...new Uint8Array(hash)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    const snapshot = normalise(
      config,
      sources,
      version,
      new Date().toISOString(),
    );
    return snapshot;
    },
    persist: async (snapshot) => { await store
      .prepare(
        "INSERT INTO snapshots (game,payload,version,fetched_at,warning) VALUES (?,?,?,?,NULL) ON CONFLICT(game) DO UPDATE SET payload=excluded.payload,version=excluded.version,fetched_at=excluded.fetched_at,warning=NULL",
      )
      .bind(config.game, JSON.stringify(snapshot), snapshot.version, Date.now())
      .run();
    },
    markFailure: async (warning) => {
      await store
        .prepare("UPDATE snapshots SET fetched_at=?,warning=? WHERE game=?")
        .bind(Date.now(), warning, config.game)
        .run();
    },
    release: async () => {
    await store
      .prepare("DELETE FROM locks WHERE scope=? AND owner=?")
      .bind(`sync:${config.game}`, owner)
      .run();
    },
  });
}
