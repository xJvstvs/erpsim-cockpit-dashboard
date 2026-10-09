export type ActionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "rejected"
  | "unknown";
export type Action = {
  id: string;
  userId: string;
  userName: string;
  game: string;
  company: string;
  kind: string;
  idempotency: string;
  hash: string;
  baseVersion: string;
  payload: unknown;
  status: ActionStatus;
  result: unknown;
  createdAt: string;
  updatedAt: string;
};
export type ActionResult = {
  status: "succeeded" | "partial" | "rejected";
  positions: {
    key: string;
    success: boolean;
    sapReference?: string;
    message: string;
  }[];
};
export interface ActionStore {
  find(user: string, key: string): Promise<Action | null>;
  claim(action: Action): Promise<boolean>;
  lock(company: string, owner: string): Promise<boolean>;
  unlock(company: string, owner: string): Promise<void>;
  save(action: Action): Promise<void>;
}
export interface VerifiedAdapter {
  evidence: {
    system: string;
    company: string;
    operation: string;
    testedAt: string;
    reference: string;
    exactAdditionalQuantity?: boolean;
  };
  execute(action: Action): Promise<ActionResult>;
  reconcile(action: Action): Promise<ActionResult | null>;
  refresh(): Promise<void>;
}
export class ActionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
/** A timeout after transmission is UNKNOWN. It is never interpreted as a failed order. */
export async function submitAction(
  action: Action,
  currentVersion: string,
  store: ActionStore,
  adapter: VerifiedAdapter,
) {
  const prior = await store.find(action.userId, action.idempotency);
  if (prior) {
    if (prior.hash !== action.hash)
      throw new ActionError(
        409,
        "Dieser Vorgangsschlüssel gehört zu einer anderen Eingabe.",
      );
    return prior;
  }
  if (action.baseVersion !== currentVersion)
    throw new ActionError(
      409,
      "Der bestätigte Datenstand hat sich geändert. Entwurf abgleichen.",
    );
  if (
    !adapter.evidence.reference ||
    adapter.evidence.company !== action.company ||
    adapter.evidence.operation !== action.kind ||
    (action.kind === "purchase" && !adapter.evidence.exactAdditionalQuantity)
  )
    throw new ActionError(
      501,
      "Die Bedeutung dieser SAP-Aktion wurde nicht nachgewiesen.",
    );
  if (!(await store.lock(`${action.game}:${action.company}`, action.id)))
    throw new ActionError(
      409,
      "Ein Unternehmensvorgang wird verarbeitet oder muss zuerst abgeglichen werden.",
    );
  let keepLock = false;
  try {
    if (!(await store.claim(action))) {
      const existing = await store.find(action.userId, action.idempotency);
      if (!existing || existing.hash !== action.hash)
        throw new ActionError(409, "Konkurrierender Vorgang.");
      return existing;
    }
    action.status = "running";
    action.updatedAt = new Date().toISOString();
    await store.save(action);
    try {
      const result = await adapter.execute(action);
      action.status = result.status;
      action.result = result;
    } catch {
      action.status = "unknown";
      action.result = {
        message:
          "SAP-Ergebnis unklar. Vor weiteren Änderungen ist ein Abgleich erforderlich. Kein automatisches erneutes Senden.",
      };
      keepLock = true;
    }
    action.updatedAt = new Date().toISOString();
    // If storing the result fails, keep the company locked: SAP may already have committed.
    try {
      await store.save(action);
    } catch (e) {
      keepLock = true;
      throw e;
    }
    if (action.status === "succeeded" || action.status === "partial") {
      try {
        await adapter.refresh();
      } catch {
        /* Confirmed SAP result remains in the durable action record; source refresh can be retried. */
      }
    }
    return action;
  } finally {
    if (!keepLock)
      await store.unlock(`${action.game}:${action.company}`, action.id);
  }
}
export async function reconcileAction(
  action: Action,
  store: ActionStore,
  adapter: VerifiedAdapter,
) {
  if (action.status !== "unknown" && action.status !== "running") return action;
  const confirmed = await adapter.reconcile(action);
  if (!confirmed) return action;
  action.status = confirmed.status;
  action.result = confirmed;
  action.updatedAt = new Date().toISOString();
  await store.save(action);
  await adapter.refresh();
  await store.unlock(`${action.game}:${action.company}`, action.id);
  return action;
}
