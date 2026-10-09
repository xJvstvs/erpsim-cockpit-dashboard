import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const drafts = sqliteTable(
  "drafts",
  {
    userId: text("user_id").notNull(),
    game: text("game").notNull(),
    kind: text("kind").notNull(),
    payload: text("payload").notNull(),
    baseVersion: text("base_version").notNull(),
    version: integer("version").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.game, t.kind] })],
);
export const snapshots = sqliteTable("snapshots", {
  game: text("game").primaryKey(),
  payload: text("payload").notNull(),
  version: text("version").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
  warning: text("warning"),
});
export const sourceStates = sqliteTable(
  "source_states",
  {
    game: text("game").notNull(),
    source: text("source").notNull(),
    payload: text("payload").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.game, t.source] })],
);
export const actions = sqliteTable(
  "actions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    userName: text("user_name").notNull(),
    game: text("game").notNull(),
    company: text("company").notNull(),
    kind: text("kind").notNull(),
    idempotency: text("idempotency").notNull(),
    hash: text("hash").notNull(),
    baseVersion: text("base_version").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull(),
    result: text("result"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("actions_idempotency").on(t.userId, t.idempotency)],
);
export const locks = sqliteTable("locks", {
  scope: text("scope").primaryKey(),
  owner: text("owner").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const audits = sqliteTable("audits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  event: text("event").notNull(),
  detail: text("detail").notNull(),
  at: text("at").notNull(),
});
