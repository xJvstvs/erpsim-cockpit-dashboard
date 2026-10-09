import type { Account, Budget, CashPeriod, Market, Point, Snapshot } from "./types";
export function bankBalance(accounts: Account[]): number | null {
  const matches: number[] = [];
  const visit = (rows: Account[]) => {
    for (const row of rows) {
      if (row.children?.length) visit(row.children);
      else if (/^(bankguthaben|bank cash account)$/i.test(row.name.replace(/^\d+\s*·\s*/, "").trim())) matches.push(row.amount);
    }
  };
  visit(accounts);
  return matches.length === 1 ? matches[0] : null;
}
export function gameDay(day: number, roundDays = 20) {
  return `R${Math.floor((day - 1) / roundDays) + 1} · T${((day - 1) % roundDays) + 1}`;
}
export function forecast(points: Point[], horizon = 5) {
  const seen = new Set<number>();
  const valid = points
    .filter(
      (p) =>
        p.value !== null &&
        Number.isFinite(p.value) &&
        !p.provisional &&
        !p.interpolated,
    )
    .sort((a, b) => b.day - a.day)
    .filter((p) => {
      if (seen.has(p.day)) return false;
      seen.add(p.day);
      return true;
    })
    .reverse();
  const last = valid.slice(-5);
  const mean = last.length
    ? last.reduce((s, p) => s + p.value!, 0) / last.length
    : null;
  const trend = valid.slice(-10),
    count = trend.length;
  const xbar = count ? trend.reduce((s, p) => s + p.day, 0) / count : 0;
  const ybar = count ? trend.reduce((s, p) => s + p.value!, 0) / count : 0;
  const denominator = trend.reduce((s, p) => s + (p.day - xbar) ** 2, 0);
  const slope =
    count >= 3 && denominator
      ? trend.reduce((s, p) => s + (p.day - xbar) * (p.value! - ybar), 0) /
        denominator
      : null;
  const end = valid.at(-1)?.day ?? 0;
  const predictions =
    mean === null
      ? []
      : Array.from({ length: horizon }, (_, i) => ({
          day: end + i + 1,
          value: Math.max(
            0,
            slope === null ? mean : ybar + slope * (end + i + 1 - xbar),
          ),
        }));
  return {
    mean,
    meanCount: last.length,
    slope,
    relative: mean && slope !== null ? slope / mean : null,
    count,
    predictions,
    upside:
      mean === null
        ? null
        : Math.max(
            0,
            predictions.reduce((s, p) => s + p.value, 0) - horizon * mean,
          ),
  };
}
export function movingAverage(points: Point[]) {
  return points.map((p, i) => ({
    ...p,
    average: forecast(points.slice(0, i + 1), 0).mean,
  }));
}
export function weightedPrice(rows: Market[]) {
  if (
    new Set(rows.map((r) => r.currency)).size > 1 ||
    new Set(rows.map((r) => r.unit)).size > 1
  )
    return null;
  const quantity = rows.reduce((s, r) => s + r.quantity, 0);
  return quantity > 0 ? rows.reduce((s, r) => s + r.value, 0) / quantity : null;
}
export function liquidityScenario(
  periods: CashPeriod[],
  base: Budget[],
  changes: Record<string, number>,
  effectiveDay: number,
) {
  const dailyDelta = base.reduce(
    (sum, b) =>
      sum +
      (Object.hasOwn(changes, `${b.product}:${b.region}`)
        ? changes[`${b.product}:${b.region}`] - b.amount
        : 0),
    0,
  );
  let cumulative = 0;
  return periods.map((p) => {
    const days = Math.max(0, p.end - Math.max(p.start, effectiveDay) + 1),
      delta = dailyDelta * days;
    cumulative += delta;
    return {
      ...p,
      days,
      delta,
      scenarioMarketing: p.marketing - delta,
      scenario: p.closing - cumulative,
    };
  });
}
export function salesSeries(
  data: Snapshot,
  filters: { product: string; region: string; channel: string },
  metric: "quantity" | "revenue" | "profit",
  days = 15,
): Point[] {
  const end = data.currentDay;
  return Array.from({ length: days }, (_, i) => {
    const day = end - days + 1 + i;
    const rows = data.sales.filter(
      (r) =>
        r.day === day &&
        (filters.product === "all" || r.product === filters.product) &&
        (filters.region === "all" || r.region === filters.region) &&
        (filters.channel === "all" || r.channel === filters.channel),
    );
    const complete = data.completedDays.includes(day),
      unknown = metric === "profit" && rows.some((r) => r.cost === null);
    return {
      day,
      value:
        unknown || (!rows.length && !complete)
          ? null
          : rows.reduce(
              (s, r) =>
                s + (metric === "profit" ? r.revenue - r.cost! : r[metric]),
              0,
            ),
      provisional: !complete,
    };
  });
}
export function coverage(stock: number, daily: number | null) {
  return daily !== null && daily > 0 ? stock / daily : null;
}
export function recommendations(data: Snapshot) {
  return data.products
    .map((p) => {
      const f = forecast(
        salesSeries(
          data,
          { product: p.id, region: "all", channel: "all" },
          "quantity",
        ),
      );
      const demand = f.predictions.reduce((s, x) => s + x.value, 0);
      const stockRows = data.inventory.filter(
        (x) => x.product === p.id && x.unit === p.unit,
      );
      const stock = stockRows.length
        ? stockRows.reduce((s, x) => s + x.stock, 0)
        : null;
      const incoming = data.incoming
        .filter(
          (x) =>
            x.product === p.id &&
            x.unit === p.unit &&
            x.due !== null &&
            x.due <= data.currentDay + 4,
        )
        .reduce((s, x) => s + x.quantity, 0);
      const marketDemand = data.market
        .filter((x) => x.product === p.id && x.unit === p.unit)
        .reduce((s, x) => s + x.quantity, 0);
      return {
        product: p,
        demand: f.mean === null ? null : Math.ceil(demand),
        stock,
        incoming,
        shortage:
          f.mean === null || stock === null
            ? null
            : Math.max(0, Math.ceil(demand - stock - incoming)),
        marketDemand,
        coverage: stock === null ? null : coverage(stock, f.mean),
      };
    })
    .sort((a, b) => (b.shortage ?? -1) - (a.shortage ?? -1));
}
