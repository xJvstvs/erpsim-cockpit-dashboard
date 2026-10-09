import test from "node:test";
import assert from "node:assert/strict";
import { normalise } from "../lib/normalise.ts";
import { bankBalance } from "../lib/analytics.ts";
const config = { game: "g1", company: "KK", roundDays: 20, entities: {} };
const sale = {
  SALES_ORDER_NUMBER: "1",
  LINE_ITEM: "10",
  SIM_ROUND: 4,
  SIM_STEP: 20,
  MATERIAL_NUMBER: "KK-F01",
  MATERIAL_DESCRIPTION: "Müsli",
  UNIT: "ST",
  CURRENCY: "EUR",
  AREA: "NO",
  DISTRIBUTION_CHANNEL: "12",
  QUANTITY: "10",
  NET_VALUE: "100",
  COST: "20",
};
const parse = (s) => normalise(config, s, "v1", "2026-10-08T12:00:00Z");
test("duplicate sales documents are counted once, instance stays isolated", () => {
  const s = parse({ Sales: [sale, sale] });
  assert.equal(s.sales.length, 1);
  assert.equal(s.currentDay, 81);
  assert.equal(s.game, "g1");
});
test("latest stock snapshot is selected, historical quantities are never summed", () => {
  const row = {
    MATERIAL_NUMBER: "KK-F01",
    STORAGE_LOCATION: "02",
    UNIT: "ST",
    SIM_ROUND: 5,
  };
  const s = parse({
    Inventory: [
      { ...row, SIM_STEP: 1, INVENTORY_OPENING_BALANCE: "100" },
      { ...row, SIM_STEP: 2, INVENTORY_OPENING_BALANCE: "80" },
    ],
  });
  assert.equal(s.inventory[0].stock, 80);
  assert.equal(s.inventory[0].reserved, null);
  assert.equal(s.inventory[0].history.length, 2);
});
test("historical marketing never becomes a current editable plan", () => {
  const s = parse({
    Marketing_Expenses: [
      { MATERIAL_NUMBER: "KK-F01", AREA: "NO", AMOUNT: "100" },
    ],
  });
  assert.deepEqual(s.budgets, []);
  assert.deepEqual(s.cash, []);
  assert.equal(
    s.capabilities.find((c) => c.key === "marketing").verified,
    false,
  );
});
test("market description is linked only when unique and to the latest completed period", () => {
  const m = {
    MATERIAL_DESCRIPTION: "Müsli",
    SIM_ROUND: 4,
    SIM_PERIOD: 4,
    AREA: "NO",
    DISTRIBUTION_CHANNEL: "12",
    QUANTITY: "20",
    NET_VALUE: "100",
    UNIT: "ST",
    CURRENCY: "EUR",
  };
  const s = parse({
    Sales: [sale],
    Market: [m, { ...m, MATERIAL_DESCRIPTION: "Unknown" }],
  });
  assert.equal(s.market.length, 1);
  assert.equal(s.market[0].to, 80);
  assert.equal(s.market[0].product, "KK-F01");
});
test("unknown costs remain null, not confirmed zero", () => {
  const s = parse({ Sales: [{ ...sale, COST: null }] });
  assert.equal(s.sales[0].cost, null);
});
test("mixed currencies fail instead of silently aggregating", () => {
  assert.throws(() =>
    parse({
      Sales: [sale, { ...sale, MATERIAL_NUMBER: "KK-F02", CURRENCY: "USD" }],
    }),
  );
});
test("malformed quantity cannot become zero", () => {
  assert.throws(() => parse({ Sales: [{ ...sale, QUANTITY: "" }] }));
});
test("financial fields use SIMULATION names and no invented closing flag", () => {
  const s = parse({
    Financial_Postings: [
      {
        ROW_ID: "7",
        SIMULATION_ROUND: 4,
        SIMULATION_STEP: 20,
        GL_ACCOUNT_NUMBER: "5000",
        GL_ACCOUNT_NAME: "Sales",
        AMOUNT: "-100",
        CURRENCY: "EUR",
      },
    ],
  });
  assert.equal(s.finances.movements[0].day, 80);
  assert.equal(s.finances.movements[0].closing, null);
  assert.deepEqual(s.finances.balance, []);
});

test("verified SIM financial fields reconcile bank and profit without treating Land as cash", () => {
  const c = { ...config, financialStatements: { balance: "Balance Sheet", income: "Income Statement", incomeSign: -1, field: "FS_LEVEL_1" } };
  const row = { SIM_ROUND: 4, SIM_STEP: 20, CURRENCY: "EUR" };
  const s = normalise(c, { Financial_Postings: [
    { ...row, ROW_ID: "1", FS_LEVEL_1: "Balance Sheet", GL_ACCOUNT_NUMBER: "1000", GL_ACCOUNT_NAME: "Land", AMOUNT: "5000" },
    { ...row, ROW_ID: "2", FS_LEVEL_1: "Balance Sheet", GL_ACCOUNT_NUMBER: "113300", GL_ACCOUNT_NAME: "Bank Cash Account", AMOUNT: "1250" },
    { ...row, ROW_ID: "3", FS_LEVEL_1: "Income Statement", GL_ACCOUNT_NUMBER: "8000", GL_ACCOUNT_NAME: "Revenues", AMOUNT: "-400" },
    { ...row, ROW_ID: "4", FS_LEVEL_1: "Income Statement", GL_ACCOUNT_NUMBER: "5000", GL_ACCOUNT_NAME: "Expenses", AMOUNT: "100" },
  ] }, "v1", "2026-10-08T12:00:00Z");
  assert.equal(bankBalance(s.finances.balance), 1250);
  assert.equal(s.finances.income[0].amount, 300);
  assert.equal(s.finances.movements[0].day, 80);
  assert.equal(bankBalance([{ id: "1000", name: "1000 · Land", amount: 5000 }]), null);
  assert.equal(bankBalance([{ id: "a", name: "Bankguthaben", amount: 1 }, { id: "b", name: "Bank Cash Account", amount: 2 }]), null);
});

test("global market periods cross rounds without adding the round offset twice", () => {
  const s = normalise({ ...config, marketPeriod: "global" }, { Sales: [sale], Market: [{
    MATERIAL_DESCRIPTION: "Müsli", SIM_ROUND: 4, SIM_PERIOD: 16, AREA: "North", DISTRIBUTION_CHANNEL: "12", QUANTITY: "20", NET_VALUE: "100", UNIT: "ST", CURRENCY: "EUR",
  }] }, "v1", "2026-10-08T12:00:00Z");
  assert.equal(s.market[0].from, 76);
  assert.equal(s.market[0].to, 80);
  assert.throws(() => normalise({ ...config, marketPeriod: "global" }, { Market: [{ SIM_ROUND: 4, SIM_PERIOD: 4 }] }, "v1", "now"), /Marktperiode/);
});

test("current stock overlays opening history; restricted stock is not a reservation", () => {
  const row = { MATERIAL_NUMBER: "KK-F01", STORAGE_LOCATION: "02", UNIT: "ST" };
  const s = parse({ Inventory: [{ ...row, SIM_ROUND: 5, SIM_STEP: 1, INVENTORY_OPENING_BALANCE: "100" }], Current_Inventory: [{ ...row, STOCK: "90", RESTRICTED: "30" }] });
  assert.equal(s.inventory[0].stock, 90);
  assert.equal(s.inventory[0].history[0].stock, 100);
  assert.equal(s.inventory[0].reserved, null);
  assert.throws(() => parse({ Inventory: [{ ...row, SIM_ROUND: 5, SIM_STEP: 1, INVENTORY_OPENING_BALANCE: "100" }], Current_Inventory: [{ ...row, UNIT: "KG", STOCK: "90" }] }), /Einheiten/);
});

test("capacity comes from verified rules and only combines matching units", () => {
  const c = { ...config, materialMaster: { "KK-F01": { category: "Fertigprodukte", unit: "ST", location: "02" }, "KK-F02": { category: "Fertigprodukte", unit: "ST", location: "02" } } };
  const data = { Current_Inventory: [{ MATERIAL_NUMBER: "KK-F01", STORAGE_LOCATION: "02", UNIT: "ST", STOCK: "90" }, { MATERIAL_NUMBER: "KK-F02", STORAGE_LOCATION: "02", UNIT: "ST", STOCK: "10" }], Current_Game_Rules: [{ CATEGORY: "Rules", ELEMENT: "Storage_Capacity", DETAIL: "Finished products", VALUE: "1000" }] };
  assert.deepEqual(normalise(c, data, "v", "now").capacities, [{ category: "Fertigprodukte", capacity: 1000, used: 100, unit: "ST" }]);
  assert.equal(normalise(c, { ...data, Current_Inventory: data.Current_Inventory.map((r,i)=>i?{...r,UNIT:"KG"}:r) }, "v", "now").capacities.length, 0);
});

test("supplier PRICE and verified material units form actual offers", () => {
  const c = { ...config, materialMaster: { "KK-R01": { category: "Rohstoffe", unit: "KG", location: "88" } } };
  const s = normalise(c, { Current_Suppliers_Prices: [{ MATERIAL_NUMBER: "KK-R01", VENDOR_CODE: "V01", PRICE: "0.33", CURRENCY: "EUR" }] }, "v", "now");
  assert.equal(s.offers[0].price, 0.33);
  assert.equal(s.offers[0].unit, "KG");
  assert.equal(s.offers[0].location, "88");
});

test("older open purchase positions remain visible; delivered positions are excluded", () => {
  const row = { PURCHASING_ORDER: "4501", MATERIAL_NUMBER: "KK-R01", QUANTITY: "100", UNIT: "KG", SIM_ROUND: 1, SIM_STEP: 1, GOODS_RECEIPT_ROUND: 2, GOODS_RECEIPT_STEP: 2 };
  const s = parse({ Purchase_Orders: [{ ...row, ROW_ID: "1", STATUS: "Ordered" }, { ...row, ROW_ID: "2", STATUS: "Ordered" }, { ...row, ROW_ID: "3", SIM_ROUND: 2, STATUS: "Delivered" }] });
  assert.equal(s.incoming.length, 2);
  assert.equal(s.incoming[0].due, 22);
});
