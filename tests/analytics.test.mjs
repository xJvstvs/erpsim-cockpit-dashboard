import test from "node:test";
import assert from "node:assert/strict";
import {
  forecast,
  gameDay,
  liquidityScenario,
  salesSeries,
  weightedPrice,
  recommendations,
} from "../lib/analytics.ts";
const observations = {
  currentDay: 6, roundDays: 20,
  products: [{ id: "F1", unit: "ST", currency: "EUR", name: "Testprodukt" }],
  sales: [1, 2, 4, 5].map(day=>({day,product:"F1",region:"NO",channel:"12",quantity:10,revenue:100,cost:50})),
  completedDays: [1, 2, 4, 5], inventory: [], incoming: [], market: [],
};
const point = (day, value, more = {}) => ({ day, value, ...more });
test("round boundary uses game time", () => {
  assert.equal(gameDay(80), "R4 · T20");
  assert.equal(gameDay(81), "R5 · T1");
});
test("linear trend respects actual gaps and excludes provisional/interpolated data", () => {
  const f = forecast([
    point(1, 10),
    point(3, 30),
    point(8, 80),
    point(9, 999, { interpolated: true }),
    point(10, 999, { provisional: true }),
    point(11, null),
  ]);
  assert.equal(f.mean, 40);
  assert.equal(f.slope, 10);
  assert.deepEqual(
    f.predictions.map((p) => p.value),
    [90, 100, 110, 120, 130],
  );
  assert.equal(f.upside, 350);
});
test("fewer than three observations use mean only", () => {
  const f = forecast([point(1, 10), point(5, 30)]);
  assert.equal(f.slope, null);
  assert.equal(f.meanCount, 2);
  assert.equal(f.upside, 0);
  assert.ok(f.predictions.every((p) => p.value === 20));
});
test("missing and confirmed zero remain distinct", () => {
  assert.equal(forecast([point(1, null)]).mean, null);
  assert.equal(forecast([point(1, 0)]).mean, 0);
});
test("negative forecasts are bounded at zero", () => {
  assert.ok(
    forecast([point(1, 90), point(2, 60), point(3, 30)]).predictions.every(
      (p) => p.value >= 0,
    ),
  );
});
test("mean uses at most five observations, regression at most ten", () => {
  const f = forecast(Array.from({ length: 30 }, (_, i) => point(i + 1, i + 1)));
  assert.equal(f.mean, 28);
  assert.equal(f.count, 10);
  assert.equal(f.meanCount, 5);
  assert.equal(f.slope, 1);
});
test("market prices are quantity weighted, never an average of averages", () => {
  assert.equal(
    weightedPrice([
      { quantity: 10, value: 20, currency: "EUR", unit: "ST" },
      { quantity: 90, value: 900, currency: "EUR", unit: "ST" },
    ]),
    9.2,
  );
});
test("mixed market currency or units cannot be aggregated", () => {
  assert.equal(
    weightedPrice([
      { quantity: 1, value: 1, currency: "EUR", unit: "ST" },
      { quantity: 1, value: 1, currency: "USD", unit: "ST" },
    ]),
    null,
  );
  assert.equal(weightedPrice([]), null);
});
const budgets = [{ product: "F1", region: "NO", amount: 1000 }];
const periods = [
  { id: "a", start: 81, end: 85, marketing: -5000, closing: 100000 },
  { id: "b", start: 86, end: 90, marketing: -5000, closing: 110000 },
];
test("1000 to 2000 daily adds 5000 over five full days and propagates", () => {
  const s = liquidityScenario(periods, budgets, { "F1:NO": 2000 }, 81);
  assert.equal(s[0].scenario, 95000);
  assert.equal(s[1].scenario, 100000);
  assert.equal(s[0].scenarioMarketing, -10000);
});
test("partial periods count only remaining effective days", () => {
  const s = liquidityScenario(periods, budgets, { "F1:NO": 2000 }, 84);
  assert.equal(s[0].days, 2);
  assert.equal(s[0].scenario, 98000);
  assert.equal(s[1].scenario, 103000);
});
test("explicit zero cancels budget, untouched cells do not change", () => {
  assert.equal(
    liquidityScenario(periods, budgets, { "F1:NO": 0 }, 81)[0].scenario,
    105000,
  );
  assert.equal(liquidityScenario(periods, budgets, {}, 81)[0].scenario, 100000);
});
test("reloaded confirmed baseline does not deduct draft twice", () => {
  const revised = periods.map((p, i) => ({
    ...p,
    closing: p.closing - (i + 1) * 5000,
    marketing: -10000,
  }));
  const s = liquidityScenario(
    revised,
    [{ ...budgets[0], amount: 2000 }],
    { "F1:NO": 2000 },
    81,
  );
  assert.equal(s[0].scenario, 95000);
  assert.equal(s[1].scenario, 100000);
});
test("sales history leaves missing day blank and marks running day provisional", () => {
  const s = salesSeries(
    observations,
    { product: "all", region: "all", channel: "all" },
    "revenue",
  );
  assert.equal(s.find((p) => p.day === 3).value, null);
  assert.equal(s.at(-1).provisional, true);
});
test("production shortage subtracts only timely confirmed-unit incoming", () => {
  const d = structuredClone(observations);
  d.inventory = [{ product: "F1", stock: 0, unit: "ST" }];
  d.incoming = [{ product: "F1", quantity: 1e9, unit: "ST", due: 1000 }];
  const r = recommendations(d).find((r) => r.product.id === "F1");
  assert.equal(r.incoming, 0);
  assert.ok(r.shortage > 0);
});
test("unknown stock cannot produce a calculated shortage", () => {
  const d = structuredClone(observations);
  d.inventory = [];
  assert.ok(
    recommendations(d).every((r) => r.stock === null && r.shortage === null),
  );
});
