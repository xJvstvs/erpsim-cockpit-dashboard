import { ApiError, secret } from "./server";
export const SERVICE_URL = "https://r75p.ucc.cloud/odata/708/";
export type SapRow = Record<string, unknown>;
export type ReadConfig = {
  game: string;
  company: string;
  roundDays: number;
  marketPeriod?: "global" | "round";
  entities: Record<
    string,
    { entity: string; scopeField: string; scopeValue: string }
  >;
  productMap?: Record<string, string>;
  materialMaster?: Record<
    string,
    { category: string; unit: string; location: string }
  >;
  financialStatements?: { balance: string; income: string; incomeSign: 1 | -1; field?: string };
};
export function readConfig(): ReadConfig | null {
  const raw = secret("SAP_READ_CONFIG");
  if (!raw) return null;
  const c = JSON.parse(raw) as ReadConfig;
  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(c.game) ||
    c.game.startsWith("demo") ||
    !c.company ||
    !Number.isInteger(c.roundDays) ||
    c.roundDays < 1 ||
    c.roundDays > 1000 ||
    !c.entities
  )
    throw new ApiError(503, "Die SAP-Lesekonfiguration ist unvollständig.");
  for (const item of Object.values(c.entities))
    if (
      !/^[A-Za-z0-9_]+$/.test(item.entity) ||
      !/^[A-Za-z0-9_]+$/.test(item.scopeField) ||
      !item.scopeValue
    )
      throw new ApiError(
        503,
        "Die Unternehmensabgrenzung einer Datenquelle fehlt.",
      );
  return c;
}
function base() {
  const url = new URL(secret("SAP_SERVICE_URL") ?? SERVICE_URL);
  const allowed = (secret("SAP_ALLOWED_HOSTS") ?? "r75p.ucc.cloud")
    .split(",")
    .map((s) => s.trim());
  if (
    url.protocol !== "https:" ||
    !allowed.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ApiError(503, "Die SAP-Adresse ist nicht freigegeben.");
  return url;
}
function authorization() {
  const token = secret("SAP_TOKEN");
  if (token) return `Bearer ${token}`;
  const name = secret("SAP_USERNAME"),
    password = secret("SAP_PASSWORD");
  if (name && password)
    return `Basic ${Buffer.from(`${name}:${password}`, "utf8").toString("base64")}`;
  return null;
}
async function sapGet(url: URL, accept: string) {
  const root = base();
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname))
    throw new ApiError(
      502,
      "SAP-Verweis liegt außerhalb des freigegebenen Dienstes.",
    );
  const auth = authorization();
  if (!auth) throw new ApiError(401, 'SAP-Anmeldung noch nicht eingerichtet. Zugangsdaten als geschützte Server-Geheimnisse hinterlegen.');
  let response: Response;
  try {
    response = await fetch(url.href, { headers: { Accept: accept, Authorization: auth }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch (e) {
    let detail = e instanceof Error ? `${e.name}: ${e.message}` : "Unbekannter Netzwerkfehler";
    for (const value of [auth, secret("SAP_PASSWORD"), secret("SAP_TOKEN"), secret("SAP_USERNAME")].filter((v): v is string => !!v)) detail = detail.replaceAll(value, "[geschützt]");
    detail = detail.replace(/https?:\/\/[^\s]+/g, "[SAP-Adresse]").replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 250);
    console.error("SAP-Verbindungsfehler", { source: url.pathname.split("/").at(-1), detail });
    throw new ApiError(502, `Die Serververbindung zu SAP ist fehlgeschlagen. ${detail}`);
  }
  if (response.status >= 300 && response.status < 400)
    throw new ApiError(502, `SAP antwortet mit einer Weiterleitung (HTTP ${response.status}). Die freigegebene Dienstadresse muss direkt erreichbar sein.`);
  if (response.status === 401)
    throw new ApiError(
      401,
      "SAP verlangt eine Anmeldung. Zugangsdaten als geschützte Server-Geheimnisse einrichten.",
    );
  if (response.status === 403)
    throw new ApiError(
      403,
      "Der SAP-Zugang hat keine Berechtigung für diese Quelle.",
    );
  if (!response.ok)
    throw new ApiError(
      502,
      `SAP antwortet mit HTTP ${response.status}. Der letzte gültige Datenstand bleibt erhalten.`,
    );
  const raw = await response.text();
  if (raw.length > 15000000)
    throw new ApiError(
      502,
      "SAP-Antwort überschreitet die freigegebene Größe.",
    );
  return raw;
}
export async function inspectMetadata() {
  const xml = await sapGet(new URL("$metadata", base()), "application/xml");
  if (!xml.includes("EntitySet"))
    throw new ApiError(502, "SAP liefert keinen erkennbaren OData-Katalog.");
  const entities = [
    ...xml.matchAll(
      /<(?:[\w]+:)?EntitySet\b[^>]*\bName=["']([A-Za-z0-9_]+)["']/g,
    ),
  ].map((m) => m[1]);
  return {
    entities: [...new Set(entities)].sort(),
    status: `SAP-Katalog gelesen. ${entities.length} Entitäten erkannt; Schreibfähigkeit ist damit noch nicht nachgewiesen.`,
  };
}
export async function readEntity(
  config: ReadConfig,
  view: string,
  entities: string[],
) {
  const mapping = config.entities[view];
  if (!mapping || !entities.includes(mapping.entity))
    throw new ApiError(
      422,
      `Keine geprüfte Zuordnung für ${view} im aktuellen Katalog.`,
    );
  const url = new URL(mapping.entity, base());
  url.searchParams.set("$format", "json");
  url.searchParams.set(
    "$filter",
    `${mapping.scopeField} eq '${mapping.scopeValue.replaceAll("'", "''")}'`,
  );
  url.searchParams.set("$top", "5000");
  const rows: SapRow[] = [];
  const seen = new Set<string>();
  let next: URL | null = url;
  while (next) {
    if (seen.has(next.href) || seen.size >= 100)
      throw new ApiError(502, "Ungültige oder zu große SAP-Paginierung.");
    seen.add(next.href);
    const parsed = JSON.parse(await sapGet(next, "application/json")) as {
      d?: { results?: SapRow[]; __next?: string };
      value?: SapRow[];
      "@odata.nextLink"?: string;
    };
    const page = parsed.d?.results ?? parsed.value;
    if (!Array.isArray(page))
      throw new ApiError(502, "SAP-Datenformat konnte nicht gelesen werden.");
    rows.push(...page);
    if (rows.length > 200000)
      throw new ApiError(
        502,
        "Zu viele Datenzeilen. Bitte Quelle zeitlich einschränken.",
      );
    const link = parsed.d?.__next ?? parsed["@odata.nextLink"];
    next = link ? new URL(link, next) : null;
  }
  return rows;
}
