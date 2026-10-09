import test from "node:test";
import assert from "node:assert/strict";
import { submitAction, reconcileAction } from "../lib/action-engine.ts";
import { canonical, validateAction } from "../lib/validation.ts";
function fixture() {
  const records = new Map(),
    locks = new Set();
  let calls = 0;
  const store = {
    find: async (u, k) => records.get(`${u}:${k}`) ?? null,
    claim: async (a) => {
      const k = `${a.userId}:${a.idempotency}`;
      if (records.has(k)) return false;
      records.set(k, structuredClone(a));
      return true;
    },
    lock: async (c) => {
      if (locks.has(c)) return false;
      locks.add(c);
      return true;
    },
    unlock: async (c) => {
      locks.delete(c);
    },
    save: async (a) => {
      records.set(`${a.userId}:${a.idempotency}`, structuredClone(a));
    },
  };
  const adapter = {
    evidence: {
      company: "KK",
      operation: "purchase",
      reference: "test-only",
      exactAdditionalQuantity: true,
    },
    execute: async () => {
      calls++;
      return {
        status: "succeeded",
        positions: [
          {
            key: "1",
            success: true,
            sapReference: "TEST-ONLY",
            message: "Test",
          },
        ],
      };
    },
    reconcile: async () => null,
    refresh: async () => {},
  };
  const action = {
    id: "a1",
    userId: "u1",
    userName: "Test",
    game: "test",
    company: "KK",
    kind: "purchase",
    idempotency: "key1",
    hash: "hash1",
    baseVersion: "v1",
    payload: [{ material: "R1", quantity: 20000 }],
    status: "queued",
    result: null,
    createdAt: "",
    updatedAt: "",
  };
  return { store, adapter, action, calls: () => calls, locks };
}
test("same idempotency key executes exactly once", async () => {
  const f = fixture();
  await submitAction(f.action, "v1", f.store, f.adapter);
  const again = await submitAction(
    { ...f.action, id: "a2" },
    "v1",
    f.store,
    f.adapter,
  );
  assert.equal(f.calls(), 1);
  assert.equal(again.id, "a1");
});
test("idempotency key cannot be reused for another payload", async () => {
  const f = fixture();
  await submitAction(f.action, "v1", f.store, f.adapter);
  await assert.rejects(
    submitAction({ ...f.action, hash: "changed" }, "v1", f.store, f.adapter),
    (e) => e.status === 409,
  );
});
test("stale source version never reaches SAP", async () => {
  const f = fixture();
  await assert.rejects(
    submitAction(f.action, "v2", f.store, f.adapter),
    (e) => e.status === 409,
  );
  assert.equal(f.calls(), 0);
});
test("additional quantity semantics must be proven", async () => {
  const f = fixture();
  f.adapter.evidence.exactAdditionalQuantity = false;
  await assert.rejects(
    submitAction(f.action, "v1", f.store, f.adapter),
    (e) => e.status === 501,
  );
});
test("ambiguous result stays unknown and blocks next company write", async () => {
  const f = fixture();
  f.adapter.execute = async () => {
    throw new Error("timeout");
  };
  const a = await submitAction(f.action, "v1", f.store, f.adapter);
  assert.equal(a.status, "unknown");
  await assert.rejects(
    submitAction(
      { ...f.action, id: "b", idempotency: "key2" },
      "v1",
      f.store,
      f.adapter,
    ),
    (e) => e.status === 409,
  );
  assert.equal(
    (await reconcileAction(a, f.store, f.adapter)).status,
    "unknown",
  );
  assert.equal(f.locks.size, 1);
});
test("confirmed reconciliation releases company without resubmission", async () => {
  const f = fixture();
  f.adapter.execute = async () => {
    throw new Error("timeout");
  };
  const a = await submitAction(f.action, "v1", f.store, f.adapter);
  f.adapter.reconcile = async () => ({ status: "succeeded", positions: [] });
  await reconcileAction(a, f.store, f.adapter);
  assert.equal(a.status, "succeeded");
  assert.equal(f.locks.size, 0);
});
test("partial successes remain positional", async () => {
  const f = fixture();
  f.adapter.execute = async () => ({
    status: "partial",
    positions: [
      { key: "1", success: true },
      { key: "2", success: false },
    ],
  });
  const a = await submitAction(f.action, "v1", f.store, f.adapter);
  assert.equal(a.status, "partial");
  assert.equal(a.result.positions[1].success, false);
});
test("exact extra order quantity is preserved; zero is a valid marketing change", () => {
  assert.deepEqual(validateAction("marketing", { "F1:NO": 0 }), { "F1:NO": 0 });
  const lines = [
    {
      material: "R1",
      vendor: "V1",
      quantity: 20000,
      unit: "KG",
      location: "88",
    },
  ];
  assert.equal(validateAction("purchase", lines)[0].quantity, 20000);
  assert.throws(() =>
    validateAction("purchase", [{ ...lines[0], quantity: 0 }]),
  );
});
test("canonical payload hash is independent of field order", () => {
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
});
