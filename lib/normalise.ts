import type { ReadConfig, SapRow } from "./sap";
import type { Snapshot, Region, Account } from "./types";
const text = (r: SapRow, key: string) => (r[key] == null ? "" : String(r[key]));
const numeric = (r: SapRow, key: string): number | null =>
  r[key] == null || r[key] === "" || !Number.isFinite(Number(r[key]))
    ? null
    : Number(r[key]);
function required(r: SapRow, key: string) {
  const n = numeric(r, key);
  if (n === null) throw new Error(`Pflichtfeld ${key} fehlt`);
  return n;
}
function day(r: SapRow, roundDays: number) {
  const round = required(r, "SIM_ROUND"),
    step = required(r, "SIM_STEP");
  if (round < 1 || step < 1 || step > roundDays)
    throw new Error("Ungültige Spielzeit");
  return (round - 1) * roundDays + step;
}
function financialDay(r: SapRow, roundDays: number) {
  return day({ ...r, SIM_ROUND: r.SIM_ROUND ?? r.SIMULATION_ROUND, SIM_STEP: r.SIM_STEP ?? r.SIMULATION_STEP }, roundDays);
}
const area = (r: SapRow): Region => {
  const raw = text(r, "AREA");
  const known = (
    {
      NO: "NO",
      SO: "SO",
      WE: "WE",
      North: "NO",
      South: "SO",
      West: "WE",
    } as Record<string, Region>
  )[raw];
  if (!known) throw new Error("Region nicht eindeutig");
  return known;
};
function unique(rows: SapRow[], keys: string[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const id = keys.map((k) => text(r, k)).join("|");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Pure mapping of verified SAP read views. No screenshot values enter live mode. */
export function normalise(
  config: ReadConfig,
  sources: Record<string, SapRow[]>,
  version: string,
  at: string,
): Snapshot {
  const rd = config.roundDays;
  const snapshot: Snapshot = {
    mode: "live",
    game: config.game,
    company: config.company,
    roundDays: rd,
    currentDay: 1,
    version,
    products: [],
    sales: [],
    completedDays: [],
    market: [],
    budgets: [],
    prices: [],
    inventory: [],
    incoming: [],
    cash: [],
    production: [],
    offers: [],
    capacities: [],
    finances: {
      period: "Nicht verifiziert",
      currency: "EUR",
      balance: [],
      income: [],
      movements: [],
    },
    sources: [],
    capabilities: [
      ["read", "Analysedaten lesen"],
      ["liquidity", "Liquiditätsplan lesen"],
      ["marketing", "Marketing speichern"],
      ["prices", "Preise speichern"],
      ["purchase", "Zusatzbestellung erstellen"],
    ].map(([key, label]) => ({
      key,
      label,
      verified: key === "read",
      reason:
        key === "read"
          ? "Katalog, Unternehmensfilter und Datenformat geprüft."
          : "Kein verifizierter Endpunkt vorhanden. Der OData-Lesekatalog belegt keine Schreibfunktion.",
    })),
  };
  const products = new Map<string, Snapshot["products"][number]>();
  for (const view of ["Sales", "Current_Pricing_Conditions"])
    for (const r of sources[view] ?? []) {
      const id = text(r, "MATERIAL_NUMBER");
      if (!id) continue;
      const currency = text(r, "CURRENCY"),
        unit = text(r, "UNIT") || config.materialMaster?.[id]?.unit;
      if (!currency || !unit) continue; // Do not infer units or currencies from screenshots.
      const existing = products.get(id);
      if (
        existing &&
        (existing.currency !== currency || existing.unit !== unit)
      )
        throw new Error("Gemischte Währung oder Einheit für ein Produkt");
      products.set(id, {
        id,
        name: text(r, "MATERIAL_DESCRIPTION") || id,
        size: "",
        unit,
        currency,
      });
    }
  snapshot.products = [...products.values()];
  if (
    new Set(snapshot.products.map((p) => p.currency)).size > 1 ||
    new Set(snapshot.products.map((p) => p.unit)).size > 1
  )
    throw new Error(
      "Gesamtansicht mit gemischten Einheiten oder Währungen benötigt getrennte Datenräume.",
    );
  if (snapshot.products.some((p) => p.currency !== "EUR" || p.unit !== "ST"))
    throw new Error(
      "Diese Cockpit-Konfiguration erwartet EUR und ST für Verkaufsprodukte. Andere Einheiten oder Währungen müssen separat eingerichtet werden.",
    );
  const saleRows = unique(sources.Sales ?? [], [
    "SALES_ORDER_NUMBER",
    "LINE_ITEM",
    "SIM_ROUND",
    "SIM_STEP",
  ]);
  if (
    saleRows.some(
      (r) =>
        text(r, "CURRENCY") !== "EUR" ||
        text(r, "UNIT") !== "ST" ||
        !text(r, "SALES_ORDER_NUMBER") ||
        !text(r, "LINE_ITEM") ||
        !text(r, "MATERIAL_NUMBER"),
    )
  )
    throw new Error(
      "Unvollständige Verkaufsdimensionen oder nicht unterstützter Datenraum.",
    );
  snapshot.sales = saleRows.map((r) => ({
    id: [text(r, "SALES_ORDER_NUMBER"), text(r, "LINE_ITEM"), day(r, rd)].join(
      ":",
    ),
    day: day(r, rd),
    product: text(r, "MATERIAL_NUMBER"),
    region: area(r),
    channel: text(r, "DISTRIBUTION_CHANNEL"),
    quantity: required(r, "QUANTITY"),
    revenue: required(r, "NET_VALUE"),
    cost: numeric(r, "COST"),
  }));
  snapshot.completedDays = [...new Set(snapshot.sales.map((r) => r.day))].sort(
    (a, b) => a - b,
  );
  snapshot.currentDay = (snapshot.completedDays.at(-1) ?? 0) + 1;
  snapshot.prices = (sources.Current_Pricing_Conditions ?? []).map((r) => ({
    product: text(r, "MATERIAL_NUMBER"),
    channel: text(r, "DISTRIBUTION_CHANNEL"),
    amount: required(r, "PRICE"),
    currency: text(r, "CURRENCY"),
  }));
  const stocks = unique(sources.Inventory ?? [], [
    "MATERIAL_NUMBER",
    "STORAGE_LOCATION",
    "SIM_ROUND",
    "SIM_STEP",
  ]);
  const stockGroups = new Map<string, SapRow[]>();
  for (const r of stocks) {
    const key = `${text(r, "MATERIAL_NUMBER")}:${text(r, "STORAGE_LOCATION")}`;
    stockGroups.set(key, [...(stockGroups.get(key) ?? []), r]);
  }
  for (const rows of stockGroups.values()) {
    rows.sort((a, b) => day(a, rd) - day(b, rd));
    const latest = rows.at(-1)!;
    const product = text(latest, "MATERIAL_NUMBER");
    // Inventory is a next-step opening snapshot; it is never summed across dates.
    snapshot.currentDay = Math.max(snapshot.currentDay, day(latest, rd));
    snapshot.inventory.push({
      product,
      category:
        config.materialMaster?.[product]?.category ?? "Nicht zugeordnet",
      location: text(latest, "STORAGE_LOCATION"),
      stock: required(latest, "INVENTORY_OPENING_BALANCE"),
      reserved: null,
      unit: text(latest, "UNIT"),
      history: rows.map((r) => ({
        day: day(r, rd),
        stock: required(r, "INVENTORY_OPENING_BALANCE"),
      })),
    });
  }
  for (const row of sources.Current_Inventory ?? []) {
    const product = text(row, "MATERIAL_NUMBER"), location = text(row, "STORAGE_LOCATION"), unit = text(row, "UNIT");
    const stock = snapshot.inventory.find(item => item.product === product && item.location === location);
    if (stock) {
      if (stock.unit !== unit) throw new Error("Aktueller und historischer Bestand haben unterschiedliche Einheiten");
      stock.stock = required(row, "STOCK");
    } else snapshot.inventory.push({ product, location, unit, stock: required(row, "STOCK"), reserved: null, category: config.materialMaster?.[product]?.category ?? "Nicht zugeordnet", history: [] });
    // RESTRICTED is restricted-use stock, not a reservation quantity.
  }
  const categories: Record<string, string> = { "Finished products": "Fertigprodukte", Packing: "Verpackung", Perishable: "Rohstoffe" };
  for (const rule of sources.Current_Game_Rules ?? []) {
    if (text(rule, "CATEGORY") !== "Rules" || text(rule, "ELEMENT") !== "Storage_Capacity") continue;
    const category = categories[text(rule, "DETAIL")];
    const rows = snapshot.inventory.filter(item => item.category === category);
    const units = new Set(rows.map(item => item.unit));
    const capacity = numeric(rule, "VALUE");
    if (category && capacity !== null && capacity > 0 && units.size === 1) snapshot.capacities.push({category, capacity, used: rows.reduce((sum, item) => sum + item.stock, 0), unit: rows[0].unit});
  }
  // Marketing_Expenses is sparse historical expenditure, not a verified editable current plan.
  // It deliberately does not populate current budgets or the liquidity baseline.
  const marketEnd = (r: SapRow) => {
    const period = required(r, "SIM_PERIOD"), round = required(r, "SIM_ROUND");
    const end = config.marketPeriod === "global" ? period * 5 : (round - 1) * rd + period * 5;
    if (!Number.isInteger(period) || period < 1 || end < (round - 1) * rd + 1 || end > round * rd)
      throw new Error("Marktperiode passt nicht zur bestätigten Spielzeit");
    return end;
  };
  const latestPeriod = Math.max(
    0,
    ...(sources.Market ?? []).map(marketEnd),
  );
  snapshot.market = (sources.Market ?? [])
    .filter(
      (r) => marketEnd(r) === latestPeriod,
    )
    .flatMap((r) => {
      const description = text(r, "MATERIAL_DESCRIPTION");
      const explicit = config.productMap?.[description];
      const matches = snapshot.products.filter((p) => p.name === description);
      const id = explicit ?? (matches.length === 1 ? matches[0].id : null);
      if (!id || !products.has(id)) return [];
      return [
        {
          product: id,
          region: area(r),
          channel: text(r, "DISTRIBUTION_CHANNEL"),
          from: latestPeriod - 4,
          to: latestPeriod,
          quantity: required(r, "QUANTITY"),
          value: required(r, "NET_VALUE"),
          currency: text(r, "CURRENCY"),
          unit: text(r, "UNIT"),
        },
      ];
    });
  const po = sources.Production_Orders ?? [];
  const latestPo = new Map<string, SapRow>();
  for (const r of po) {
    const id = text(r, "PRODUCTION_ORDER"),
      old = latestPo.get(id);
    if (!old || day(r, rd) > day(old, rd)) latestPo.set(id, r);
  }
  snapshot.production = [...latestPo.values()].map((r) => {
    const br = required(r, "BEGIN_ROUND"),
      bs = required(r, "BEGIN_STEP"),
      er = numeric(r, "END_ROUND"),
      es = numeric(r, "END_STEP");
    const target = required(r, "TARGET_QUANTITY"),
      confirmed = required(r, "CONFIRMED_QUANTITY");
    return {
      id: text(r, "PRODUCTION_ORDER"),
      product: text(r, "MATERIAL_NUMBER"),
      start: (br - 1) * rd + bs,
      end: er && es ? (er - 1) * rd + es : null,
      target,
      confirmed,
      status:
        confirmed >= target
          ? "Bestätigt"
          : confirmed > 0
            ? "In Arbeit"
            : "Geplant",
    };
  });
  snapshot.incoming = snapshot.production
    .filter((p) => p.confirmed < p.target)
    .map((p) => ({
      id: p.id,
      product: p.product,
      quantity: p.target - p.confirmed,
      unit:
        config.materialMaster?.[p.product]?.unit ??
        products.get(p.product)?.unit ??
        "",
      due: p.end,
      type: "Produktion",
      status: p.status,
    }));
  // Preserve distinct open ROW_ID positions, including older orders. Delivered positions are not expected receipts.
  const purchase = sources.Purchase_Orders ?? [];
  for (const r of unique(
    purchase.filter((r) => !/^(Delivered|Cancelled|Closed)$/i.test(text(r, "STATUS"))),
    ["ROW_ID"],
  )) {
    const gr = numeric(r, "GOODS_RECEIPT_ROUND"),
      gs = numeric(r, "GOODS_RECEIPT_STEP");
    snapshot.incoming.push({
      id: text(r, "PURCHASING_ORDER"),
      product: text(r, "MATERIAL_NUMBER"),
      quantity: required(r, "QUANTITY"),
      unit: text(r, "UNIT"),
      due: gr && gs ? (gr - 1) * rd + gs : null,
      type: "Einkauf",
      status: text(r, "STATUS") || "Nicht ausgewiesen",
    });
  }
  for (const r of sources.Current_Suppliers_Prices ?? []) {
    const material = text(r, "MATERIAL_NUMBER"),
      master = config.materialMaster?.[material];
    if (!master?.unit || !master.location) continue;
    snapshot.offers.push({
      material,
      description: text(r, "MATERIAL_DESCRIPTION"),
      vendor: text(r, "VENDOR_CODE"),
      vendorName: text(r, "VENDOR_NAME"),
      price: required(r, r.PRICE == null ? "NET_PRICE" : "PRICE"),
      currency: text(r, "CURRENCY"),
      unit: master.unit,
      location: master.location,
      leadDays: null,
    });
  }
  const financial = unique(sources.Financial_Postings ?? [], ["ROW_ID"]);
  if (financial.some((r) => text(r, "CURRENCY") !== "EUR"))
    throw new Error(
      "Finanzbuchungen in anderer Währung müssen separat ausgewertet werden.",
    );
  snapshot.finances.movements = financial.map((r) => ({
    id: text(r, "ROW_ID"),
    day: financialDay(r, rd),
    account: text(r, "GL_ACCOUNT_NUMBER"),
    amount: required(r, "AMOUNT"),
    description: text(r, "GL_ACCOUNT_NAME"),
    closing: null,
  }));
  if (config.financialStatements) {
    const spec = config.financialStatements;
    if (spec.incomeSign !== 1 && spec.incomeSign !== -1)
      throw new Error("GuV-Vorzeichen nicht bestätigt");
    const tree = (statement: string, multiplier: number, cutoff = Infinity) => {
      const roots: Account[] = [];
      for (const row of financial.filter(
        (r) =>
          text(r, spec.field ?? "Financial_Statements") === statement &&
          financialDay(r, rd) <= cutoff,
      )) {
        let nodes = roots;
        const amount = required(row, "AMOUNT") * multiplier;
        const levels = [1, 2, 3, 4]
          .map((i) => text(row, `FS_LEVEL_${i}`))
          .filter(Boolean);
        levels.push(
          `${text(row, "GL_ACCOUNT_NUMBER")} · ${text(row, "GL_ACCOUNT_NAME")}`,
        );
        for (let i = 0; i < levels.length; i++) {
          const name = levels[i];
          let node = nodes.find((n) => n.name === name);
          if (!node) {
            node = {
              id: `${statement}:${levels.slice(0, i + 1).join("/")}`,
              name,
              amount: 0,
              ...(i < levels.length - 1 ? { children: [] } : {}),
            };
            nodes.push(node);
          }
          node.amount += amount;
          nodes = node.children ?? [];
        }
      }
      return roots;
    };
    snapshot.finances.balance = tree(spec.balance, 1);
    snapshot.finances.income = tree(spec.income, spec.incomeSign);
    const latest = Math.max(
      0,
      ...snapshot.finances.movements.map((m) => m.day),
    );
    snapshot.finances.period = `Kumuliert bis R${Math.floor((latest - 1) / rd) + 1} · T${((latest - 1) % rd) + 1}`;
    const cutoffs = [
      ...new Set(
        snapshot.finances.movements
          .map((m) => m.day)
          .filter((d) => d % rd === 0)
          .concat(latest),
      ),
    ]
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    snapshot.financialHistory = cutoffs.map((end) => ({
      period: `Kumuliert bis R${Math.floor((end - 1) / rd) + 1} · T${((end - 1) % rd) + 1}`,
      currency: "EUR",
      balance: tree(spec.balance, 1, end),
      income: tree(spec.income, spec.incomeSign, end),
      movements: snapshot.finances.movements.filter((m) => m.day <= end),
    }));
  }
  snapshot.sources = Object.entries(sources).map(([name]) => ({
    name,
    state: "ok",
    at,
    period: "OData-Snapshot",
    detail: "R12-Zeitzuordnung; vollständiger Unternehmensfilter.",
  }));
  for (const name of [
    "Marketingplan",
    "Liquidität",
    "Abschlusskennzeichnung",
    ...(snapshot.capacities.length ? [] : ["Lagerkapazitäten"]),
    "Reservierungen",
  ])
    snapshot.sources.push({
      name,
      state: "missing",
      at: null,
      period: "Quelle nicht verifiziert",
      detail:
        "Diese Information wird aus dem Lesekatalog nicht zuverlässig abgeleitet.",
    });
  return snapshot;
}
