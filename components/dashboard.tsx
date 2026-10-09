"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Megaphone,
  ChartNoAxesCombined,
  Boxes,
  ShoppingCart,
  Factory,
  ArrowUpRight,
  ArrowRight,
  RefreshCw,
  Settings2,
  ShieldCheck,
  CircleHelp,
  ChevronRight,
  Activity,
  Wallet,
  Package,
  TrendingUp,
  Clock3,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { ChartContainer } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  bankBalance,
  forecast,
  gameDay,
  movingAverage,
  recommendations,
  salesSeries,
} from "@/lib/analytics";
import type { Section, Snapshot } from "@/lib/types";
import {
  Marketing,
  MarketPrices,
  InventoryFinance,
  Purchasing,
  Production,
} from "./operations";
import { registerCockpitTools } from "@/lib/webmcp";
import { ActionLog } from './action-log';

export const number = (v: number | null | undefined, digits = 0) =>
  v == null
    ? "–"
    : new Intl.NumberFormat("de-DE", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(v);
export const euro = (v: number | null | undefined, digits = 0) =>
  v == null ? "–" : `${number(Object.is(v, -0) ? 0 : v, digits)} €`;
export const regions = { NO: "Nord", SO: "Süd", WE: "West" };
const navigation = [
  {
    id: "cockpit",
    name: "Cockpit",
    icon: LayoutDashboard,
    description: "Dein Unternehmen auf einen Blick.",
  },
  {
    id: "marketing",
    name: "Marketing & Liquidität",
    icon: Megaphone,
    description: "Budgets planen. Liquidität im Blick behalten.",
  },
  {
    id: "market",
    name: "Markt & Preise",
    icon: ChartNoAxesCombined,
    description: "Marktnachfrage verstehen und Kanalpreise bearbeiten.",
  },
  {
    id: "inventory",
    name: "Bestände & Finanzen",
    icon: Boxes,
    description: "Warenflüsse, Reichweiten und finanzielle Ergebnisse.",
  },
  {
    id: "purchasing",
    name: "Einkauf",
    icon: ShoppingCart,
    description: "Zusätzliche Mengen bestellen und Zugänge verfolgen.",
  },
  {
    id: "production",
    name: "Produktion",
    icon: Factory,
    description: "Aufträge planen und den nächsten Bedarf erkennen.",
  },
] as const;

export function Panel({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  note,
  icon: Icon = Activity,
  emphasis = false,
}: {
  label: string;
  value: string;
  note: string;
  icon?: typeof Activity;
  emphasis?: boolean;
}) {
  return (
    <div className={`metric ${emphasis ? "metric-emphasis" : ""}`}>
      <div className="metric-label">
        {label}
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <NativeSelect
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </NativeSelect>
    </label>
  );
}
function NavigationButton({
  item,
  active,
  navigate,
}: {
  item: (typeof navigation)[number];
  active: boolean;
  navigate: (id: Section) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      isActive={active}
      onClick={() => {
        navigate(item.id);
        setOpenMobile(false);
      }}
      tooltip={item.name}
    >
      <item.icon />
      <span>{item.name}</span>
      {active && <ChevronRight className="nav-arrow" />}
    </SidebarMenuButton>
  );
}
function ConnectionButton({ open }: { open: () => void }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Button
      variant="ghost"
      className="settings-button"
      onClick={() => {
        setOpenMobile(false);
        open();
      }}
    >
      <Settings2 size={18} />
      Verbindung & Datenquellen
    </Button>
  );
}

export default function Dashboard({
  user,
  initial,
  initialWarning = null,
}: {
  user: string;
  initial: Snapshot | null;
  initialWarning?: string | null;
}) {
  const [data, setData] = useState(initial);
  const [section, setSection] = useState<Section>("cockpit");
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(initialWarning);
  const active = navigation.find((n) => n.id === section)!;
  useEffect(() => {
    const read = () => {
      const id = location.hash.slice(1);
      if (navigation.some((n) => n.id === id)) setSection(id as Section);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const navigate = useCallback((id: Section) => {
    const guard = new Event("cockpit:before-navigate", { cancelable: true });
    window.dispatchEvent(guard);
    if (
      guard.defaultPrevented &&
      !window.confirm(
        "Ungespeicherte Änderungen verwerfen und den Bereich wechseln?",
      )
    )
      return false;
    setSection(id);
    history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
    return true;
  }, []);
  const visibleState = useRef({ data, section });
  useEffect(() => {
    visibleState.current = { data, section };
  }, [data, section]);
  useEffect(
    () =>
      registerCockpitTools([
        {
          name: "navigate_cockpit_section",
          title: "Dashboard-Bereich öffnen",
          description:
            "Öffnet einen der sechs Dashboard-Bereiche. Verändert keine SAP-Daten.",
          inputSchema: {
            type: "object",
            properties: {
              section: { type: "string", enum: navigation.map((n) => n.id) },
            },
            required: ["section"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input) => {
            const id = (input as { section?: string })?.section;
            if (!navigation.some((n) => n.id === id))
              throw new Error("Unbekannter Dashboard-Bereich");
            if (!navigate(id as Section))
              throw new Error(
                "Bereichswechsel abgebrochen; Entwurf bleibt erhalten.",
              );
            return { section: id };
          },
        },
        {
          name: "read_cockpit_summary",
          title: "Cockpit-Zusammenfassung lesen",
          description:
            "Liest Modus, Spielzeit, bestätigte Tage und freigeschaltete Funktionen des sichtbaren Datenstands.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: () => {
            const { data: d, section: s } = visibleState.current;
            if (!d) return { mode: "unavailable", section: s, sourceStatus: [], capabilities: [] };
            return {
              mode: d.mode,
              game: d.game,
              day: gameDay(d.currentDay, d.roundDays),
              section: s,
              completedDays: d.completedDays.length,
              capabilities: d.capabilities,
              sourceStatus: d.sources,
            };
          },
        },
      ]),
    [navigate],
  );
  const reload = async (manual = false) => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Anmeldung abgelaufen. Bitte erneut anmelden."
            : "Aktualisierung fehlgeschlagen. Der letzte Datenstand bleibt sichtbar.",
        );
      const body = (await response.json()) as {
        snapshot: Snapshot | null;
        warning?: string;
      };
      setData(body.snapshot);
      setSyncError(body.warning ?? null);
      if (manual) {
        if (body.warning || !body.snapshot) toast.error(body.warning ?? "Noch keine SAP-Daten verfügbar.");
        else toast.success("SAP-Datenstand aktualisiert");
      }
    } catch (err) {
      setSyncError((err as Error).message);
    } finally {
      if (manual) setLoading(false);
    }
  };
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, 15000);
    return () => clearInterval(timer);
  }, []); // First snapshot is rendered by the authenticated server page.

  return (
    <SidebarProvider>
      <Sidebar className="cockpit-sidebar" collapsible="offcanvas">
        <SidebarHeader>
          <a
            className="brand"
            href="#cockpit"
            onClick={(e) => {
              e.preventDefault();
              navigate("cockpit");
            }}
          >
            <div className="brand-mark">
              <Activity size={24} />
            </div>
            <span>
              ERPsim<span>C O C K P I T</span>
            </span>
          </a>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <p className="nav-label">UNTERNEHMENSSTEUERUNG</p>
            <SidebarMenu>
              {navigation.map((n) => (
                <SidebarMenuItem key={n.id}>
                  <NavigationButton
                    item={n}
                    active={section === n.id}
                    navigate={navigate}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <div className="simulation-card">
            <span className="live-dot" />
            <b>Manufacturing Extended</b>
            <p>{data ? `Unternehmen ${data.company} · Mandant 708` : "SAP-Daten noch nicht verfügbar"}</p>
            <div>
              <span>Aktueller Spieltag</span>
              <strong>{data ? gameDay(data.currentDay, data.roundDays) : "–"}</strong>
            </div>
            <small>
              {data?.game ?? "Kein bestätigter Datenstand"}
            </small>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <ConnectionButton open={() => setSettingsOpen(true)} />
          <div className="user-row">
            <div>{user.slice(0, 2).toUpperCase()}</div>
            <span>
              <b>{user}</b>
              <small>Geschützter Teamzugriff</small>
            </span>
            <ShieldCheck size={17} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>{data ? `Unternehmen ${data.company}` : "SAP"}</span>
            <ChevronRight size={15} />
            <b>{active.name}</b>
          </div>
          <div className="topbar-right">
            <span className="status-pill">
              <span />
              {!data ? "Keine SAP-Daten" : syncError ? "Letzter SAP-Datenstand" : "SAP verbunden"}
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                void reload(true);
              }}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              <span className="hide-small">Aktualisieren</span>
            </Button>
          </div>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                MANUFACTURING EXTENDED <span>/</span>{" "}
                {data ? gameDay(data.currentDay, data.roundDays) : "Datenstand ausstehend"}
              </div>
              <h1>
                {active.name === "Cockpit" ? "Alles im Blick." : active.name}
              </h1>
              <p>{active.description}</p>
            </div>
            <Badge variant="outline" className="period-badge">
              <Clock3 size={14} />
              {data ? "Gemeinsamer bestätigter SAP-Datenstand" : "Kein Datenstand"}
            </Badge>
          </div>
          <div className="data-notice">
            <CircleHelp size={17} />
            <p>
              {data ? "Jede Quelle zeigt ihren eigenen Datenstand. Der laufende Spieltag ist vorläufig." : "Kennzahlen erscheinen erst, wenn SAP einen bestätigten Datenstand liefert."}
            </p>
            <button onClick={() => setSettingsOpen(true)}>
              Datenquellen <ArrowUpRight size={14} />
            </button>
          </div>
          {syncError && (
            <div className="error-banner" role="status">
              {syncError}
            </div>
          )}
          {!data ? (
            <Panel title="Keine SAP-Daten verfügbar" subtitle="Die Datenverbindung ist noch nicht erfolgreich geladen.">
              <p className="subtle-note">Sobald die Verbindung wieder funktioniert, werden die Daten automatisch geladen. Du kannst die Verbindung unter „Datenquellen“ prüfen.</p>
            </Panel>
          ) : section === "cockpit" ? (
            <Cockpit data={data} navigate={navigate} />
          ) : section === "marketing" ? (
            <Marketing key={data.game} data={data} />
          ) : section === "market" ? (
            <MarketPrices key={data.game} data={data} />
          ) : section === "inventory" ? (
            <InventoryFinance data={data} />
          ) : section === "purchasing" ? (
            <Purchasing key={data.game} data={data} />
          ) : (
            <Production data={data} />
          )}
          <footer className="workspace-footer">
            <ShieldCheck size={14} />
            <span>Persönliche Entwürfe · gemeinsamer Datenstand</span>
            <span>Spielzeit statt Kalenderzeit</span>
          </footer>
        </main>
      </SidebarInset>
      <SettingsDialog
        data={data}
        reload={reload}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}

function Cockpit({
  data,
  navigate,
}: {
  data: Snapshot;
  navigate: (id: Section) => void;
}) {
  const [product, setProduct] = useState("all"),
    [region, setRegion] = useState("all"),
    [channel, setChannel] = useState("all"),
    [range, setRange] = useState("15");
  const [metric, setMetric] = useState<"quantity" | "revenue" | "profit">(
    "revenue",
  );
  const series = useMemo(
    () =>
      salesSeries(data, { product, region, channel }, metric, Number(range)),
    [data, product, region, channel, metric, range],
  );
  const f = forecast(series);
  const chart = movingAverage(series).map((p) => ({
    day: p.day,
    actual: p.provisional ? null : p.value,
    provisional: p.provisional ? p.value : null,
    average: p.average,
    predicted: null as number | null,
  }));
  const end = series.filter((p) => !p.provisional && p.value !== null).at(-1);
  const lastChart = chart.find((p) => p.day === end?.day);
  if (lastChart) lastChart.predicted = end!.value;
  for (const p of f.predictions) {
    const existing = chart.find((x) => x.day === p.day);
    if (existing) existing.predicted = p.value;
    else
      chart.push({
        day: p.day,
        actual: null,
        provisional: null,
        average: f.mean,
        predicted: p.value,
      });
  }
  const total = series.some((p) => !p.provisional && p.value !== null)
    ? series
        .filter((p) => !p.provisional)
        .reduce((s, p) => s + (p.value ?? 0), 0)
    : null;
  const format =
    metric === "quantity" ? (v: number | null) => `${number(v)} ST` : euro;
  const recs = recommendations(data),
    risks = recs.filter((r) => r.shortage && r.shortage > 0);
  const cashLow = data.cash.length
    ? Math.min(...data.cash.map((x) => x.closing))
    : null;
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label={
            metric === "quantity"
              ? "Absatz im Zeitraum"
              : metric === "profit"
                ? "Rohertrag im Zeitraum"
                : "Umsatz im Zeitraum"
          }
          value={format(total)}
          note={`${series.filter((p) => p.value !== null && !p.provisional).length} bestätigte Spieltage`}
          icon={ChartNoAxesCombined}
        />
        <Metric
          label="Tagesdurchschnitt"
          value={format(f.mean)}
          note={`Letzte ${f.meanCount} verfügbare abgeschlossene Tage`}
          icon={Activity}
        />
        <Metric
          label="Prognose · nächste 5 Tage"
          value={format(
            f.predictions.length
              ? f.predictions.reduce((s, p) => s + p.value, 0)
              : null,
          )}
          note={
            f.slope === null
              ? "Auf Basis des Tagesmittels"
              : "Auf Basis des linearen Trends"
          }
          icon={TrendingUp}
          emphasis
        />
        <Metric
          label="Niedrigste geplante Liquidität"
          value={euro(cashLow)}
          note="Offizieller Plan · ohne neue Entwürfe"
          icon={Wallet}
        />
      </div>
      <Panel
        title="Sales im Zeitverlauf"
        subtitle="Eigene Tageswerte mit gleitendem Mittelwert und Ausblick."
        action={
          <div className="segmented" aria-label="Kennzahl">
            {[
              ["revenue", "Umsatz"],
              ["quantity", "Absatz"],
              ["profit", "Rohertrag"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={metric === key}
                className={metric === key ? "active" : ""}
                onClick={() => setMetric(key as typeof metric)}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="filter-bar">
          <Select label="Produkt" value={product} onChange={setProduct}>
            <option value="all">Alle Produkte</option>
            {data.products.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.size}
              </option>
            ))}
          </Select>
          <Select label="Region" value={region} onChange={setRegion}>
            <option value="all">Alle Regionen</option>
            {Object.entries(regions).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select label="Vertriebskanal" value={channel} onChange={setChannel}>
            <option value="all">Alle Kanäle</option>
            {[...new Set(data.prices.map((p) => p.channel))].map((c) => (
              <option key={c} value={c}>
                Kanal {c}
              </option>
            ))}
          </Select>
          <Select label="Zeitraum" value={range} onChange={setRange}>
            <option value="10">10 Spieltage</option>
            <option value="15">15 Spieltage</option>
            <option value="20">20 Spieltage</option>
          </Select>
        </div>
        <div className="chart-legend">
          <span>
            <i className="legend-actual" />
            Bestätigt
          </span>
          <span>
            <i className="legend-mean" />
            Mittelwert (5 Tage)
          </span>
          <span>
            <i className="legend-forecast" />
            Prognose
          </span>
          <span>
            <i className="legend-provisional" />
            Vorläufig
          </span>
        </div>
        <ChartContainer
          className="sales-chart"
          config={{
            actual: { label: "Bestätigt", color: "#183d56" },
            average: { label: "Mittelwert", color: "#98acb9" },
            predicted: { label: "Prognose", color: "#10a39b" },
          }}
        >
          <ComposedChart
            data={chart}
            margin={{ top: 12, right: 22, left: 15, bottom: 5 }}
          >
            <defs>
              <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#244f69" stopOpacity={0.13} />
                <stop offset="1" stopColor="#244f69" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e7edf1" />
            <XAxis
              dataKey="day"
              tickFormatter={(d) => gameDay(d, data.roundDays)}
              axisLine={false}
              tickLine={false}
              tickMargin={14}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => number(v / 1000) + "k"}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              labelFormatter={(d) => gameDay(Number(d), data.roundDays)}
              formatter={(v, name) => [
                format(Number(v)),
                (
                  {
                    actual: "Bestätigt",
                    average: "Mittelwert",
                    predicted: "Prognose",
                    provisional: "Vorläufig",
                  } as Record<string, string>
                )[String(name)],
              ]}
              contentStyle={{ borderRadius: 10, borderColor: "#e0e7ed" }}
            />
            <ReferenceLine
              x={end?.day}
              stroke="#c2cfd7"
              strokeDasharray="4 4"
            />
            <Area
              dataKey="actual"
              type="linear"
              fill="url(#sales-fill)"
              stroke="#183d56"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#183d56" }}
              connectNulls={false}
            />
            <Line
              dataKey="average"
              type="linear"
              stroke="#9bafb9"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="predicted"
              type="linear"
              stroke="#10a39b"
              strokeWidth={2.5}
              strokeDasharray="6 5"
              dot={{ r: 3, fill: "#10a39b" }}
            />
            <Line
              dataKey="provisional"
              stroke="#e3a43d"
              dot={{ r: 4, fill: "#e3a43d" }}
            />
          </ComposedChart>
        </ChartContainer>
        <div className="trend-strip">
          <div>
            <span>Trendsteigung</span>
            <strong>
              {f.slope === null
                ? "Noch nicht berechenbar"
                : `${f.slope >= 0 ? "+" : ""}${format(f.slope)} / Spieltag`}
            </strong>
            <small>
              {f.relative === null
                ? "Mindestens 3 echte Tageswerte nötig"
                : `${number(f.relative * 100, 1)} % des Tagesmittels`}
            </small>
          </div>
          <div>
            <span>Potenzielle Upside · 5 Tage</span>
            <strong className="teal">+{format(f.upside)}</strong>
            <small>Trendprognose gegenüber konstantem Mittelwert</small>
          </div>
          <p>
            <CircleHelp size={17} />
            {f.count} echte Tageswerte im Trend. Lücken werden nicht als Null
            behandelt. Prognosen sind Schätzungen.
          </p>
        </div>
      </Panel>
      <div className="summary-grid">
        <Panel
          title="Bestände im Fokus"
          subtitle={`${risks.length} Produkte mit möglicher Fehlmenge in 5 Tagen`}
          action={
            <Button variant="ghost" onClick={() => navigate("inventory")}>
              Details <ArrowUpRight size={16} />
            </Button>
          }
        >
          <div className="summary-list">
            {recs.slice(0, 3).map((r) => (
              <div key={r.product.id}>
                <span className="product-dot">
                  <Package size={17} />
                </span>
                <div>
                  <b>{r.product.name}</b>
                  <small>
                    {r.product.size} · {r.product.id}
                  </small>
                </div>
                <span>
                  <b>{number(r.stock)} ST</b>
                  <small className={r.stock === 0 ? "amber" : ""}>
                    {r.coverage === null
                      ? "Reichweite unbekannt"
                      : `${number(r.coverage, 1)} Tage Reichweite`}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Finanzieller Überblick"
          subtitle={data.finances.period}
          action={
            <Button variant="ghost" onClick={() => navigate("inventory")}>
              Details <ArrowUpRight size={16} />
            </Button>
          }
        >
          <div className="finance-summary">
            <div>
              <span>Bankguthaben · bilanziell</span>
              <b>
                {euro(
                  bankBalance(data.finances.balance),
                )}
              </b>
            </div>
            <div>
              <span>Ergebnis · GuV</span>
              <b className="teal">
                {euro(
                  data.finances.income.length
                    ? data.finances.income.reduce((s, x) => s + x.amount, 0)
                    : null,
                )}
              </b>
            </div>
            <div className="summary-note">
              <ShieldCheck size={16} />
              Auswertung vorhandener Buchungen
            </div>
          </div>
        </Panel>
      </div>
      <div className="attention-row">
        <span className="attention-icon">
          <Clock3 size={19} />
        </span>
        <div>
          <b>Die nächsten Zugänge</b>
          <p>
            {data.incoming
              .slice(0, 2)
              .map(
                (x) =>
                  `${number(x.quantity)} ${x.unit} · ${x.product} · ${x.due ? gameDay(x.due, data.roundDays) : "Termin offen"}`,
              )
              .join("    /    ") || "Keine bestätigten Zugänge"}
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate("production")}>
          Produktion <ArrowRight size={16} />
        </Button>
      </div>
    </>
  );
}

function SettingsDialog({
  data,
  reload,
  open,
  onOpenChange,
}: {
  data: Snapshot | null;
  reload: (manual?: boolean) => Promise<void>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [audit, setAudit] = useState<{
      status: string;
      entities?: string[];
    } | null>(null),
    [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const b = (await r.json()) as { status?: string; error?: string; entities?: string[] };
      const status = b.status ?? b.error ?? 'Verbindung konnte nicht geprüft werden';
      setAudit({ status, entities: b.entities });
      if (!r.ok) toast.error(status);
    } catch {
      toast.error("Verbindungsprüfung fehlgeschlagen");
    } finally {
      setChecking(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog">
        <DialogHeader>
          <DialogTitle>SAP-Verbindung & Datenquellen</DialogTitle>
          <DialogDescription>
            Direkte Serveranbindung. Ein laufender Team-PC oder
            SAP-Browser-Helfer ist dafür nicht erforderlich.
          </DialogDescription>
        </DialogHeader>
        <div className="connection-address">
          <span>SAP OData · Mandant 708</span>
          <code>https://r75p.ucc.cloud/odata/708/</code>
          <small>
            Zugangsdaten werden ausschließlich als Server-Geheimnisse
            eingerichtet.
          </small>
        </div>
        <div className="capability-list">
          {data?.capabilities.map((c) => (
            <div key={c.key}>
              <span>{c.label}</span>
              <Badge variant="outline">
                {c.verified ? "Geprüft" : "Noch nicht freigegeben"}
              </Badge>
              <small>{c.reason}</small>
            </div>
          ))}
        </div>
        <div className="source-list">
          {data?.sources.map((s) => (
            <div key={s.name}>
              <b>{s.name}</b>
              <span>{s.period}</span>
              <small>
                {s.at
                    ? new Date(s.at).toLocaleString("de-DE")
                    : "Kein Datenstand"}
              </small>
            </div>
          ))}
        </div>
        {!data && <p className="subtle-note">Es wurde noch kein bestätigter SAP-Datenstand geladen.</p>}
        {data && <ActionLog game={data.game} />}
        {audit && (
          <div className="data-notice">
            {audit.status}
            {audit.entities && ` · ${audit.entities.length} Entitäten erkannt`}
          </div>
        )}
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => void reload(true)}>
            Datenstand laden
          </Button>
          <Button onClick={() => void check()} disabled={checking}>
            {checking && <RefreshCw className="animate-spin" size={15} />}
            Verbindung prüfen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
