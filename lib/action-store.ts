import { db } from "./server";
import type { Action, ActionStore } from "./action-engine";
type Row = {
  id: string;
  user_id: string;
  user_name: string;
  game: string;
  company: string;
  kind: string;
  idempotency: string;
  hash: string;
  base_version: string;
  payload: string;
  status: Action["status"];
  result: string | null;
  created_at: string;
  updated_at: string;
};
export function readAction(r: Row): Action {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    game: r.game,
    company: r.company,
    kind: r.kind,
    idempotency: r.idempotency,
    hash: r.hash,
    baseVersion: r.base_version,
    payload: JSON.parse(r.payload),
    status: r.status,
    result: r.result ? JSON.parse(r.result) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export const actionStore: ActionStore = {
  async find(user, key) {
    const r = await db()
      .prepare("SELECT * FROM actions WHERE user_id=? AND idempotency=?")
      .bind(user, key)
      .first<Row>();
    return r ? readAction(r) : null;
  },
  async claim(a) {
    const r = await db()
      .prepare(
        "INSERT OR IGNORE INTO actions (id,user_id,user_name,game,company,kind,idempotency,hash,base_version,payload,status,result,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        a.id,
        a.userId,
        a.userName,
        a.game,
        a.company,
        a.kind,
        a.idempotency,
        a.hash,
        a.baseVersion,
        JSON.stringify(a.payload),
        a.status,
        null,
        a.createdAt,
        a.updatedAt,
      )
      .run();
    return r.meta.changes === 1;
  },
  async lock(company, owner) {
    const r = await db()
      .prepare(
        "INSERT OR IGNORE INTO locks (scope,owner,expires_at) VALUES (?,?,?)",
      )
      .bind(`write:${company}`, owner, Number.MAX_SAFE_INTEGER)
      .run();
    return r.meta.changes === 1;
  },
  async unlock(company, owner) {
    await db()
      .prepare("DELETE FROM locks WHERE scope=? AND owner=?")
      .bind(`write:${company}`, owner)
      .run();
  },
  async save(a) {
    await db()
      .prepare("UPDATE actions SET status=?,result=?,updated_at=? WHERE id=?")
      .bind(a.status, JSON.stringify(a.result), a.updatedAt, a.id)
      .run();
  },
};
export async function recentActions(game: string) {
  const rows = await db()
    .prepare(
      "SELECT * FROM actions WHERE game=? ORDER BY created_at DESC LIMIT 50",
    )
    .bind(game)
    .all<Row>();
  return rows.results.map(readAction);
}
export async function actionById(id: string) {
  const row = await db()
    .prepare("SELECT * FROM actions WHERE id=?")
    .bind(id)
    .first<Row>();
  return row ? readAction(row) : null;
}
