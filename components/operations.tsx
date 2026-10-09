"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Copy,
  Plus,
  Trash2,
  Save,
  Check,
  TrendingUp,
  CircleHelp,
  ChevronDown,
  Send,
  PackageCheck,
  AlertTriangle,
} from "lucide-react";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Panel, Metric, Select, number, euro, regions } from "./dashboard";
import {
  bankBalance,
  gameDay,
  liquidityScenario,
  recommendations,
  weightedPrice,
} from "@/lib/analytics";
import type { Snapshot, PurchaseLine } from "@/lib/types";

function useDraft<T>(kind: string, data: Snapshot, empty: T) {
  const [value, setValue] = useState<T>(empty),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Entwurf noch nicht gespeichert"),
    [ready, setReady] = useState(false),
    [baseVersion, setBaseVersion] = useState(data.version);
  const [savedValue, setSavedValue] = useState(JSON.stringify(empty));
  const dirty = JSON.stringify(value) !== savedValue;
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigation = (event: Event) => event.preventDefault();
    window.addEventListener("beforeunload", unload);
    window.addEventListener("cockpit:before-navigate", navigation);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("cockpit:before-navigate", navigation);
    };
  }, [dirty]);
  useEffect(() => {
    let active = true;
    fetch(`/api/drafts/${kind}?game=${encodeURIComponent(data.game)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Entwürfe konnten nicht geladen werden.");
        return (await r.json()) as {
          payload: T | null;
          version: number;
          baseVersion?: string;
        };
      })
      .then((b) => {
        if (active) {
          if (b.payload !== null) {
            setValue(b.payload);
            setSavedValue(JSON.stringify(b.payload));
          }
          if (b.baseVersion) setBaseVersion(b.baseVersion);
          setVersion(b.version);
          setStatus(
            b.version
              ? `Persönlicher Entwurf · Version ${b.version}`
              : "Entwurf noch nicht gespeichert",
          );
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setStatus(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind, data.game]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/drafts/${kind}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: data.game,
          version,
          baseVersion,
          payload: value,
        }),
      });
      const b = (await r.json()) as { error?: string; version: number };
      if (!r.ok) throw new Error(b.error ?? "Speichern fehlgeschlagen.");
      setVersion(b.version);
      setSavedValue(JSON.stringify(value));
      setStatus(`Gespeichert · Version ${b.version}`);
      toast.success("Persönlicher Entwurf gespeichert");
    } catch (e) {
      setStatus((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const hasEdits = Array.isArray(value)
    ? value.some((v) => v.quantity > 0)
    : Object.keys(value as object).length > 0;
  const stale = hasEdits && baseVersion !== data.version;
  const reset = () => {
    setValue(empty);
    setBaseVersion(data.version);
    setStatus("Entwurf zurückgesetzt. Zum dauerhaften Entfernen speichern.");
  };
  return {
    value,
    setValue,
    save,
    busy,
    status: stale
      ? "Die SAP-Basis hat sich geändert. Entwurf prüfen und bewusst zurücksetzen."
      : status,
    ready,
    stale,
    reset,
    baseVersion,
  };
}

function Review({
  data,
  kind,
  payload,
  rows,
  open,
  onOpenChange,
  baseVersion,
}: {
  data: Snapshot;
  kind: "marketing" | "prices" | "purchase";
  payload: unknown;
  rows: { label: string; value: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  baseVersion: string;
}) {
  const capability = data.capabilities.find((c) => c.key === kind);
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const changeOpen = (next: boolean) => {
    if (!next && !busy) {
      setKey("");
      setResult(null);
    }
    onOpenChange(next);
  };
  const execute = async () => {
    if (busy) return;
    const requestKey = key || crypto.randomUUID();
    setKey(requestKey);
    setBusy(true);
    try {
      const r = await fetch("/api/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({ game: data.game, kind, baseVersion, payload }),
      });
      const b = (await r.json()) as {
        error?: string;
        id: string;
        status: string;
      };
      if (!r.ok)
        throw new Error(b.error ?? "Aktion konnte nicht angelegt werden");
      setResult(`Vorgang ${b.id}: ${b.status}. Details im Aktionsprotokoll.`);
      toast.success("Vorgang angelegt");
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === "purchase"
              ? "Zusatzbestellung prüfen"
              : "Änderungen prüfen"}
          </DialogTitle>
          <DialogDescription>
            {kind === "purchase"
              ? "Die eingegebenen Mengen werden zusätzlich bestellt. Vorhandener Bestand wird nicht abgezogen."
              : "Nur die hier aufgeführten Änderungen werden übertragen."}
          </DialogDescription>
        </DialogHeader>
        <div className="review-list">
          {rows.map((r, i) => (
            <div key={i}>
              <span>{r.label}</span>
              <b>{r.value}</b>
            </div>
          ))}
        </div>
        {!capability?.verified && (
          <div className="error-banner">
            <b>SAP-Übertragung noch gesperrt</b>
            <p>
              {capability?.reason ??
                "Es fehlt eine verifizierte Schnittstelle."}
            </p>
          </div>
        )}
        {result && <p role="status">{result}</p>}
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => changeOpen(false)}>
            Zurück zum Entwurf
          </Button>
          <Button
            disabled={
              !capability?.verified ||
              busy ||
              rows.length === 0
            }
            onClick={() => void execute()}
          >
            <Send size={15} />
            An SAP übertragen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Marketing({ data }: { data: Snapshot }) {
  const draft = useDraft<Record<string, string>>("marketing", data, {});
  const [selected, setSelected] = useState<string[]>([]),
    [copyValue, setCopyValue] = useState("100"),
    [review, setReview] = useState(false);
  const parse = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const invalid = Object.values(draft.value).some(
    (v) => !Number.isFinite(parse(v)) || parse(v) < 0,
  );
  const changes = Object.fromEntries(
    Object.entries(draft.value)
      .filter(
        ([key, value]) =>
          Number.isFinite(parse(value)) &&
          parse(value) >= 0 &&
          data.budgets.find((b) => `${b.product}:${b.region}` === key)
            ?.amount !== parse(value),
      )
      .map(([k, v]) => [k, parse(v)]),
  );
  const budget = (product: string, region: string) => {
    const key = `${product}:${region}`;
    return (
      draft.value[key] ??
      String(
        data.budgets.find((b) => b.product === product && b.region === region)
          ?.amount ?? "",
      )
    );
  };
  if (!data.budgets.length || !data.cash.length)
    return (
      <Panel
        title="Marketing & Liquidität noch nicht verbunden"
        subtitle="Es fehlt eine verifizierte aktuelle Planbasis."
      >
        <p className="subtle-note">
          Historische Marketingausgaben ersetzen keinen aktuellen Plan. Für die
          Live-Vorschau werden der vollständige Marketingplan und die offizielle
          Liquiditätsplanung benötigt. Gespeicherte Entwürfe werden erhalten.
        </p>
      </Panel>
    );
  const dailyBase = data.budgets.reduce((s, b) => s + b.amount, 0);
  const dailyNew = data.budgets.reduce(
    (s, b) => s + (changes[`${b.product}:${b.region}`] ?? b.amount),
    0,
  );
  const scenario = liquidityScenario(
    data.cash,
    data.budgets,
    changes,
    data.currentDay,
  );
  const min = scenario.length
    ? Math.min(...scenario.map((p) => p.scenario))
    : null;
  const apply = () => {
    const amount = parse(copyValue);
    if (!Number.isFinite(amount) || amount < 0 || !selected.length) {
      toast.error("Produkte auswählen und ein gültiges Tagesbudget eingeben.");
      return;
    }
    draft.setValue((v) => ({
      ...v,
      ...Object.fromEntries(
        selected.flatMap((p) =>
          Object.keys(regions).map((r) => [`${p}:${r}`, String(amount)]),
        ),
      ),
    }));
  };
  const sumRegion = (region: string) =>
    data.products.reduce((s, p) => s + (parse(budget(p.id, region)) || 0), 0);
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Bisheriges Tagesbudget"
          value={euro(dailyBase)}
          note="Basis aus dem gespeicherten Plan"
        />
        <Metric
          label="Geplantes Tagesbudget"
          value={euro(dailyNew)}
          note={`${Object.keys(changes).length} geänderte Produkt-Region-Felder`}
          emphasis
        />
        <Metric
          label="Änderung pro Spieltag"
          value={`${dailyNew - dailyBase >= 0 ? "+" : ""}${euro(dailyNew - dailyBase)}`}
          note="Mehrbudget belastet die Liquidität"
        />
        <Metric
          label="Niedrigster Szenariobestand"
          value={euro(min)}
          note="Kumulierte Wirkung auf alle Folgeperioden"
        />
      </div>
      <div className="split-view">
        <Panel
          title="Marketingplan"
          subtitle="Tagesbudget in Euro · Produkt × Region"
        >
          <div className="inline-controls">
            <label>
              <Input
                aria-label="Budget zum Übertragen"
                type="number"
                min="0"
                step="1"
                value={copyValue}
                onChange={(e) => setCopyValue(e.target.value)}
              />
              € / Tag
            </label>
            <Button variant="outline" onClick={apply} disabled={!draft.ready}>
              <Copy size={14} />
              Auf Auswahl übertragen
            </Button>
            <span className="muted text-xs">{selected.length} Produkte</span>
          </div>
          <div className="table-wrap">
            <Table className="data-table">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label="Alle Produkte auswählen"
                      checked={selected.length === data.products.length}
                      onCheckedChange={(v) =>
                        setSelected(v ? data.products.map((p) => p.id) : [])
                      }
                    />
                  </TableHead>
                  <TableHead>Produkt</TableHead>
                  {Object.entries(regions).map(([r, name]) => (
                    <TableHead key={r} className="right">
                      {name}
                    </TableHead>
                  ))}
                  <TableHead className="right">Gesamt / Tag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`${p.name} ${p.size} auswählen`}
                        checked={selected.includes(p.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) =>
                            v ? [...s, p.id] : s.filter((x) => x !== p.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <b>{p.name}</b>
                      <small>
                        {p.id} · {p.size}
                      </small>
                    </TableCell>
                    {Object.entries(regions).map(([r, name]) => (
                      <TableCell key={r}>
                        <Input
                          aria-label={`${p.id} ${name} Tagesbudget`}
                          type="number"
                          min="0"
                          step=".01"
                          disabled={!draft.ready}
                          value={budget(p.id, r)}
                          className={
                            Object.hasOwn(changes, `${p.id}:${r}`)
                              ? "changed"
                              : ""
                          }
                          onChange={(e) =>
                            draft.setValue((v) => ({
                              ...v,
                              [`${p.id}:${r}`]: e.target.value,
                            }))
                          }
                        />
                        <small className="text-right">
                          Basis{" "}
                          {euro(
                            data.budgets.find(
                              (b) => b.product === p.id && b.region === r,
                            )?.amount,
                          )}
                        </small>
                      </TableCell>
                    ))}
                    <TableCell className="right">
                      <b>
                        {euro(
                          Object.keys(regions).reduce(
                            (s, r) => s + (parse(budget(p.id, r)) || 0),
                            0,
                          ),
                        )}
                      </b>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="total-row">
                  <TableCell />
                  <TableCell>Summe pro Tag</TableCell>
                  {Object.keys(regions).map((r) => (
                    <TableCell key={r} className="right">
                      {euro(sumRegion(r))}
                    </TableCell>
                  ))}
                  <TableCell className="right">{euro(dailyNew)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {invalid && (
            <p className="input-error">
              Leere oder negative Budgets sind ungültig. Für eine bewusste
              Streichung 0 eingeben.
            </p>
          )}
          <div className="action-bar">
            <span className="draft-message">{draft.status}</span>
            <div>
              <Button
                variant="ghost"
                onClick={draft.reset}
                disabled={!draft.ready}
              >
                Zurücksetzen
              </Button>
              <Button
                variant="outline"
                disabled={!draft.ready || draft.busy || invalid}
                onClick={() => void draft.save()}
              >
                <Save size={14} />
                Entwurf speichern
              </Button>
              <Button
                disabled={
                  draft.stale || invalid || !Object.keys(changes).length
                }
                onClick={() => setReview(true)}
              >
                Änderungen prüfen <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </Panel>
        <div>
          <Panel
            title="Liquiditätswirkung"
            subtitle="Bestehender Plan und dein Marketing-Szenario"
          >
            <div className="chart-legend">
              <span>
                <i className="legend-actual" />
                SAP-Plan
              </span>
              <span>
                <i className="legend-forecast" />
                Szenario
              </span>
            </div>
            <ChartContainer
              className="sales-chart"
              config={{
                closing: { label: "SAP-Plan", color: "#183d56" },
                scenario: { label: "Szenario", color: "#0ba69a" },
              }}
            >
              <LineChart
                data={scenario}
                margin={{ left: 10, right: 28, bottom: 5, top: 15 }}
              >
                <CartesianGrid vertical={false} stroke="#e9eff2" />
                <XAxis
                  dataKey="end"
                  tickFormatter={(d) => gameDay(d, data.roundDays)}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis
                  tickFormatter={(v) => `${number(v / 1e6, 1)} Mio.`}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  labelFormatter={(v) => gameDay(Number(v), data.roundDays)}
                  formatter={(v, name) => [
                    euro(Number(v)),
                    name === "closing" ? "SAP-Plan" : "Szenario",
                  ]}
                />
                <Line
                  type="linear"
                  dataKey="closing"
                  stroke="#183d56"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
                <Line
                  type="linear"
                  dataKey="scenario"
                  stroke="#0ba69a"
                  strokeWidth={2.5}
                  strokeDasharray="5 4"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ChartContainer>
            <p className="subtle-note">
              Der Marketingentwurf ersetzt bereits enthaltene Budgets. Ab{" "}
              {gameDay(data.currentDay, data.roundDays)} zählt nur die
              verbleibende Zeit. Verkaufsprognosen sind hier keine gesicherten
              Zahlungseingänge.
            </p>
          </Panel>
          <Panel
            title="Periodenplanung"
            subtitle="Alle Beträge in Euro; Schlussbestand ist Liquidität"
          >
            <div className="table-wrap">
              <Table className="data-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Periode</TableHead>
                    <TableHead className="right">Kunden</TableHead>
                    <TableHead className="right">Lieferanten</TableHead>
                    <TableHead className="right">Marketing</TableHead>
                    <TableHead className="right">Kosten</TableHead>
                    <TableHead className="right">Zinsen</TableHead>
                    <TableHead className="right">SAP-Schluss</TableHead>
                    <TableHead className="right">Szenario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenario.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <b>{gameDay(p.end, data.roundDays)}</b>
                        <small>{p.days} betroffene Tage</small>
                      </TableCell>
                      <TableCell className="right">
                        {number(p.customers)}
                      </TableCell>
                      <TableCell className="right">
                        {number(p.vendors)}
                      </TableCell>
                      <TableCell className="right">
                        {number(p.scenarioMarketing)}
                        <small>Δ {number(-p.delta)}</small>
                      </TableCell>
                      <TableCell className="right">
                        {number(p.overhead)}
                      </TableCell>
                      <TableCell className="right">
                        {number(p.interest)}
                      </TableCell>
                      <TableCell className="right">
                        {number(p.closing)}
                      </TableCell>
                      <TableCell className="right">
                        <b className={p.scenario === min ? "amber" : "teal"}>
                          {number(p.scenario)}
                        </b>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </div>
      </div>
      <Review
        data={data}
        baseVersion={draft.baseVersion}
        kind="marketing"
        payload={changes}
        rows={Object.entries(changes).map(([k, v]) => ({
          label: k,
          value: `${euro(v, 2)} / Tag`,
        }))}
        open={review}
        onOpenChange={setReview}
      />
    </>
  );
}

export function MarketPrices({ data }: { data: Snapshot }) {
  const draft = useDraft<Record<string, string>>("prices", data, {});
  const [expanded, setExpanded] = useState<string[]>([]),
    [review, setReview] = useState(false);
  const channels = [...new Set(data.prices.map((p) => p.channel))];
  const latest = data.market.length
    ? Math.max(...data.market.map((m) => m.to))
    : null;
  const current = data.market.filter((m) => m.to === latest);
  const changes = Object.fromEntries(
    Object.entries(draft.value)
      .filter(
        ([k, v]) =>
          v.trim() !== "" &&
          Number.isFinite(Number(v)) &&
          Number(v) > 0 &&
          data.prices.find((p) => `${p.product}:${p.channel}` === k)?.amount !==
            Number(v),
      )
      .map(([k, v]) => [k, Number(v)]),
  );
  const invalid = Object.values(draft.value).some(
    (v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) <= 0,
  );
  const own = (p: string, c: string) =>
    draft.value[`${p}:${c}`] ??
    String(
      data.prices.find((x) => x.product === p && x.channel === c)?.amount ?? "",
    );
  const copy = (product: string) => {
    const first = own(product, channels[0]);
    draft.setValue((v) => ({
      ...v,
      ...Object.fromEntries(channels.map((c) => [`${product}:${c}`, first])),
    }));
    toast.success("Preis auf alle verfügbaren Kanäle übertragen");
  };
  return (
    <>
      <div className="attention-row mb-6">
        <span className="attention-icon">
          <TrendingUp size={19} />
        </span>
        <div>
          <b>Letzter abgeschlossener Marktbericht</b>
          <p>
            {latest
              ? `${gameDay(latest - 4, data.roundDays)} bis ${gameDay(latest, data.roundDays)}`
              : "Noch kein Marktbericht"}{" "}
            · Marktpreis = Gesamtwert ÷ Gesamtmenge. Während der Aktualisierung
            bleibt dieser Bericht sichtbar.
          </p>
        </div>
        <span className="row-tag">5-Tage-Periode</span>
      </div>
      <Panel
        title="Preise nach Vertriebskanal"
        subtitle="Eigene Preise parallel bearbeiten und mit dem mengengewichteten Marktpreis vergleichen."
      >
        <div className="table-wrap">
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                {channels.map((c) => (
                  <TableHead key={c} colSpan={2}>
                    Vertriebskanal {c}
                  </TableHead>
                ))}
                <TableHead>Übertragen</TableHead>
              </TableRow>
              <TableRow>
                <TableHead />
                {channels.map((c) => (
                  <TableHead key={c} colSpan={2}>
                    Eigener Preis / Markt / Abweichung
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.map((p) => {
                const visible = expanded.includes(p.id);
                return (
                  <TableRowGroup key={p.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          className="flex items-center gap-2 text-left"
                          aria-expanded={visible}
                          onClick={() =>
                            setExpanded((v) =>
                              visible
                                ? v.filter((x) => x !== p.id)
                                : [...v, p.id],
                            )
                          }
                        >
                          <ChevronDown
                            size={15}
                            style={{
                              transform: visible ? "rotate(180deg)" : "",
                            }}
                          />
                          <span>
                            <b>{p.name}</b>
                            <small>
                              {p.id} · {p.size}
                            </small>
                          </span>
                        </button>
                      </TableCell>
                      {channels.map((c) => {
                        const market = weightedPrice(
                          current.filter(
                            (m) => m.product === p.id && m.channel === c,
                          ),
                        );
                        const amount = Number(own(p.id, c));
                        return (
                          <TableCell key={c} colSpan={2}>
                            <div className="flex items-center gap-4">
                              <Input
                                aria-label={`${p.id} Preis Kanal ${c}`}
                                type="number"
                                min=".01"
                                step=".01"
                                disabled={!draft.ready}
                                value={own(p.id, c)}
                                className={
                                  Object.hasOwn(changes, `${p.id}:${c}`)
                                    ? "changed"
                                    : ""
                                }
                                onChange={(e) =>
                                  draft.setValue((v) => ({
                                    ...v,
                                    [`${p.id}:${c}`]: e.target.value,
                                  }))
                                }
                              />
                              <div>
                                <b>{euro(market, 2)}</b>
                                <small
                                  className={
                                    market && amount < market ? "teal" : ""
                                  }
                                >
                                  {market
                                    ? `${amount < market ? "" : "+"}${number((amount / market - 1) * 100, 1)} % zum Markt`
                                    : "Keine eindeutigen Marktdaten"}
                                </small>
                              </div>
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <Button
                          variant="ghost"
                          aria-label={`Preis ${p.id} für alle Kanäle`}
                          onClick={() => copy(p.id)}
                          disabled={!draft.ready || !channels.length}
                        >
                          <Copy size={14} />
                          Alle Kanäle
                        </Button>
                      </TableCell>
                    </TableRow>
                    {visible &&
                      Object.entries(regions).map(([r, name]) => (
                        <TableRow key={r}>
                          <TableCell className="pl-12! muted">{name}</TableCell>
                          {channels.map((c) => {
                            const m = current.filter(
                              (x) =>
                                x.product === p.id &&
                                x.channel === c &&
                                x.region === r,
                            );
                            return (
                              <TableCell key={c} colSpan={2}>
                                <b>{euro(weightedPrice(m), 2)}</b>
                                <small>
                                  {number(
                                    m.reduce((s, x) => s + x.quantity, 0),
                                  )}{" "}
                                  {p.unit} Marktmenge
                                </small>
                              </TableCell>
                            );
                          })}
                          <TableCell />
                        </TableRow>
                      ))}
                  </TableRowGroup>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {invalid && (
          <p className="input-error">
            Preise müssen größer als null sein. Leere Felder sind keine
            Preisänderung.
          </p>
        )}
        <div className="action-bar">
          <span role="status">{draft.status}</span>
          <div>
            <Button
              variant="ghost"
              onClick={draft.reset}
              disabled={!draft.ready}
            >
              Zurücksetzen
            </Button>
            <Button
              variant="outline"
              onClick={() => void draft.save()}
              disabled={!draft.ready || draft.busy || invalid}
            >
              <Save size={14} />
              Entwurf speichern
            </Button>
            <Button
              disabled={draft.stale || invalid || !Object.keys(changes).length}
              onClick={() => setReview(true)}
            >
              {Object.keys(changes).length} Preisänderungen prüfen{" "}
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </Panel>
      <p className="subtle-note">
        „Alle Kanäle“ kopiert den Preis der ersten verfügbaren Kanalspalte. Die
        Übertragung erfolgt erst nach gemeinsamer Prüfung.
      </p>
      <Review
        data={data}
        baseVersion={draft.baseVersion}
        kind="prices"
        payload={changes}
        rows={Object.entries(changes).map(([k, v]) => ({
          label: k,
          value: euro(v, 2),
        }))}
        open={review}
        onOpenChange={setReview}
      />
    </>
  );
}
// A fragment keeps expanded regional rows in the same accessible table body.
function TableRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function InventoryFinance({ data }: { data: Snapshot }) {
  const [category, setCategory] = useState("all"),
    [location, setLocation] = useState("all");
  const recs = recommendations(data);
  const [financePeriod, setFinancePeriod] = useState(data.finances.period);
  const finance =
    data.financialHistory?.find((f) => f.period === financePeriod) ??
    data.finances;
  const items = data.inventory.filter(
    (i) =>
      (category === "all" || i.category === category) &&
      (location === "all" || i.location === location),
  );
  const productName = (id: string) =>
    data.products.find((p) => p.id === id)?.name ??
    data.offers.find((o) => o.material === id)?.description ??
    id;
  return (
    <Tabs defaultValue="stock">
      <TabsList className="mb-6">
        <TabsTrigger value="stock">Bestände</TabsTrigger>
        <TabsTrigger value="finance">Finanzen & Abschlüsse</TabsTrigger>
      </TabsList>
      <TabsContent value="stock">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {data.capacities.map((c) => (
            <Panel
              key={c.category}
              title={c.category}
              subtitle="Lagerauslastung"
            >
              <div className="capacity-row">
                <div>
                  <b>
                    {number(c.used)} / {number(c.capacity)} {c.unit}
                  </b>
                  <span>{number((c.used / c.capacity) * 100, 1)} %</span>
                </div>
                <Progress value={Math.min(100, (c.used / c.capacity) * 100)} />
                <small>
                  Aus verifizierten Stammdaten
                </small>
              </div>
            </Panel>
          ))}
        </div>
        <Panel
          title="Materialübersicht"
          subtitle="Bestand und Reservierung sind getrennte Kennzahlen; Reservierung wird nicht ungeprüft abgezogen."
        >
          <div className="filter-bar">
            <Select label="Kategorie" value={category} onChange={setCategory}>
              <option value="all">Alle Kategorien</option>
              {[...new Set(data.inventory.map((i) => i.category))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select label="Lagerort" value={location} onChange={setLocation}>
              <option value="all">Alle Lagerorte</option>
              {[...new Set(data.inventory.map((i) => i.location))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div className="table-wrap">
            <Table className="data-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Kategorie / Ort</TableHead>
                  <TableHead className="right">Bestand</TableHead>
                  <TableHead className="right">Reserviert</TableHead>
                  <TableHead>Entwicklung</TableHead>
                  <TableHead className="right">Reichweite</TableHead>
                  <TableHead>Nächster Zugang</TableHead>
                  <TableHead>Hinweis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => {
                  const rec = recs.find((r) => r.product.id === i.product);
                  const incoming = data.incoming
                    .filter((x) => x.product === i.product && x.unit === i.unit)
                    .sort(
                      (a, b) => (a.due ?? Infinity) - (b.due ?? Infinity),
                    )[0];
                  const previous =
                    i.history.length > 1 ? i.history.at(-2) : null;
                  const delta = previous ? i.stock - previous.stock : null;
                  return (
                    <TableRow key={`${i.product}:${i.location}`}>
                      <TableCell>
                        <b>{productName(i.product)}</b>
                        <small>
                          {i.product} ·{" "}
                          {data.products.find((p) => p.id === i.product)
                            ?.size ?? i.unit}
                        </small>
                      </TableCell>
                      <TableCell>
                        {i.category}
                        <small>Lager {i.location}</small>
                      </TableCell>
                      <TableCell className="right">
                        <b>
                          {number(i.stock)} {i.unit}
                        </b>
                      </TableCell>
                      <TableCell className="right">
                        {number(i.reserved)} {i.unit}
                      </TableCell>
                      <TableCell>
                        <Sparkline points={i.history.map((x) => x.stock)} />
                        <small>
                          {delta === null
                            ? "Keine Historie"
                            : `${delta >= 0 ? "+" : ""}${number(delta)} seit ${gameDay(previous!.day, data.roundDays)}`}
                        </small>
                      </TableCell>
                      <TableCell className="right">
                        {rec?.coverage != null
                          ? `${number(rec.coverage, 1)} Tage`
                          : "Unbekannt"}
                        <small>
                          {rec ? "Eigener Ø Absatz" : "Verbrauchsdaten fehlen"}
                        </small>
                      </TableCell>
                      <TableCell>
                        {incoming
                          ? `${number(incoming.quantity)} ${incoming.unit}`
                          : "–"}
                        <small>
                          {incoming?.due
                            ? `${incoming.type} · ${gameDay(incoming.due, data.roundDays)}`
                            : incoming
                              ? "Termin offen"
                              : "Kein bestätigter Zugang"}
                        </small>
                      </TableCell>
                      <TableCell>
                        {i.stock === 0 ? (
                          <span className="row-tag warning">Bestandslücke</span>
                        ) : rec?.coverage != null && rec.coverage > 15 ? (
                          <span className="row-tag warning">
                            Hohe Reichweite
                          </span>
                        ) : (
                          <span className="row-tag">Vorhanden</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </TabsContent>
      <TabsContent value="finance">
        <div className="filter-bar mb-6">
          <Select
            label="Finanzperiode"
            value={financePeriod}
            onChange={setFinancePeriod}
          >
            {(data.financialHistory ?? [data.finances]).map((f) => (
              <option key={f.period} value={f.period}>
                {f.period}
              </option>
            ))}
          </Select>
        </div>
        <div className="metrics-grid">
          <Metric
            label="Bilanzieller Bankbestand"
            value={euro(
              bankBalance(finance.balance),
            )}
            note={finance.period}
          />
          <Metric
            label="Ergebnis laut GuV"
            value={euro(
              finance.income.length
                ? finance.income.reduce((s, a) => s + a.amount, 0)
                : null,
            )}
            note="Umsatz abzüglich ausgewiesener Aufwendungen"
            emphasis
          />
          <Metric
            label="Liquidität · niedrigster Planwert"
            value={
              data.cash.length
                ? euro(Math.min(...data.cash.map((c) => c.closing)))
                : "–"
            }
            note="Planwert aus Marketing & Liquidität"
          />
          <Metric
            label="Bewegungen im Datenstand"
            value={number(finance.movements.length)}
            note="Nur vorhandene Buchungen, keine neue Verbuchung"
          />
        </div>
        <div className="summary-grid">
          <Panel title="Bilanz" subtitle={`${finance.period} · EUR`}>
            <div className="account-tree">
              {finance.balance.length ? (
                finance.balance.map((a) => (
                  <AccountBranch key={a.id} account={a} />
                ))
              ) : (
                <div className="empty-state">
                  Bilanzhierarchie noch nicht verifiziert.
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Gewinn- und Verlustrechnung" subtitle={finance.period}>
            <Table className="data-table">
              <TableBody>
                {finance.income.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {a.name}
                      <small>Konto {a.id}</small>
                    </TableCell>
                    <TableCell className="right">{euro(a.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="total-row">
                  <TableCell>Ergebnis</TableCell>
                  <TableCell className="right teal">
                    {euro(
                      finance.income.length
                        ? finance.income.reduce((s, a) => s + a.amount, 0)
                        : null,
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Panel>
        </div>
        <Panel
          title="Kontenbewegungen & Abschlussstatus"
          subtitle="Nur explizit identifizierte Abschlussbuchungen tragen diese Kennzeichnung."
        >
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Beleg</TableHead>
                <TableHead>Spieltag</TableHead>
                <TableHead>Konto</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead className="right">Betrag</TableHead>
                <TableHead>Abschluss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finance.movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.id}</TableCell>
                  <TableCell>{gameDay(m.day, data.roundDays)}</TableCell>
                  <TableCell>{m.account}</TableCell>
                  <TableCell>{m.description}</TableCell>
                  <TableCell className="right">{euro(m.amount, 2)}</TableCell>
                  <TableCell>
                    {m.closing === null
                      ? "Nicht ausgewiesen"
                      : m.closing
                        ? "Abschlussbuchung"
                        : "Laufende Buchung"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </TabsContent>
    </Tabs>
  );
}
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <span>–</span>;
  const max = Math.max(...points),
    min = Math.min(...points),
    span = max - min || 1;
  return (
    <svg
      width="90"
      height="25"
      role="img"
      aria-label={`Bestandsverlauf: ${points.map((x) => number(x)).join(", ")}`}
    >
      <polyline
        fill="none"
        stroke="#508c9e"
        strokeWidth="1.8"
        points={points
          .map(
            (p, i) =>
              `${(i * 88) / (points.length - 1) + 1},${23 - ((p - min) / span) * 20}`,
          )
          .join(" ")}
      />
    </svg>
  );
}
function AccountBranch({
  account,
}: {
  account: import("@/lib/types").Account;
}) {
  return account.children?.length ? (
    <details open>
      <summary>
        {account.name}
        <b>{euro(account.amount)}</b>
      </summary>
      {account.children.map((child) => (
        <AccountBranch key={child.id} account={child} />
      ))}
    </details>
  ) : (
    <div>
      <span>{account.name}</span>
      <b>{euro(account.amount)}</b>
    </div>
  );
}

export function Purchasing({ data }: { data: Snapshot }) {
  const empty = (): PurchaseLine => {
    const o = data.offers[0];
    return {
      material: o?.material ?? "",
      vendor: o?.vendor ?? "",
      quantity: 0,
      unit: o?.unit ?? "",
      location: o?.location ?? "",
    };
  };
  const draft = useDraft<PurchaseLine[]>("purchase", data, [empty()]);
  const [review, setReview] = useState(false);
  const offer = (l: PurchaseLine) =>
    data.offers.find(
      (o) =>
        o.material === l.material && o.vendor === l.vendor && o.unit === l.unit,
    );
  const invalid =
    !draft.value.length ||
    draft.value.some(
      (l) =>
        !offer(l) ||
        !Number.isFinite(l.quantity) ||
        l.quantity <= 0 ||
        !l.location,
    );
  const totals = draft.value.reduce(
    (totals, l) => {
      const o = offer(l);
      if (o)
        totals[o.currency] =
          (totals[o.currency] ?? 0) +
          (Number.isFinite(l.quantity) ? l.quantity * o.price : 0);
      return totals;
    },
    {} as Record<string, number>,
  );
  const update = (i: number, next: Partial<PurchaseLine>) =>
    draft.setValue((v) => v.map((l, j) => (i === j ? { ...l, ...next } : l)));
  return (
    <>
      <div className="attention-row mb-6">
        <span className="attention-icon">
          <PackageCheck size={20} />
        </span>
        <div>
          <b>Ein Formular. Mehrere Materialien. Exakte zusätzliche Mengen.</b>
          <p>
            Deine Eingabe wird weder um Lagerbestände noch um offene Zugänge
            reduziert. Bestellung und tatsächlicher Wareneingang bleiben
            getrennte Schritte.
          </p>
        </div>
      </div>
      <Panel
        title="Zusatzbestellung vorbereiten"
        subtitle="Verfügbare Materialien und Konditionen aus den Lieferantenangeboten"
        action={
          <Button
            variant="outline"
            onClick={() => draft.setValue((v) => [...v, empty()])}
            disabled={!draft.ready}
          >
            <Plus size={14} />
            Position hinzufügen
          </Button>
        }
      >
        <div className="table-wrap">
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Lieferant</TableHead>
                <TableHead>Zusätzliche Menge</TableHead>
                <TableHead>Einheit</TableHead>
                <TableHead>Ziel-Lagerort</TableHead>
                <TableHead className="right">Stückpreis</TableHead>
                <TableHead className="right">Positionswert</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.value.map((l, i) => {
                const o = offer(l);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <NativeSelect
                        aria-label={`Material Position ${i + 1}`}
                        value={`${l.material}:${l.vendor}`}
                        className="item-selector"
                        onChange={(e) => {
                          const [material, vendor] = e.target.value.split(":");
                          const next = data.offers.find(
                            (x) =>
                              x.material === material && x.vendor === vendor,
                          )!;
                          update(i, {
                            material,
                            vendor,
                            unit: next.unit,
                            location: next.location,
                          });
                        }}
                        disabled={!draft.ready}
                      >
                        {data.offers.map((o) => (
                          <option
                            key={`${o.material}:${o.vendor}`}
                            value={`${o.material}:${o.vendor}`}
                          >
                            {o.description} · {o.material}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      {o?.vendorName ?? "Unbekannt"}
                      <small>{l.vendor}</small>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Zusätzliche Menge Position ${i + 1}`}
                        type="number"
                        min=".001"
                        step="any"
                        value={l.quantity || ""}
                        onChange={(e) =>
                          update(i, { quantity: Number(e.target.value) })
                        }
                        disabled={!draft.ready}
                      />
                    </TableCell>
                    <TableCell>{l.unit}</TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Lagerort Position ${i + 1}`}
                        value={l.location}
                        onChange={(e) =>
                          update(i, { location: e.target.value })
                        }
                        disabled={!draft.ready}
                      />
                    </TableCell>
                    <TableCell className="right">
                      {o ? `${number(o.price, 2)} ${o.currency}` : "–"}
                    </TableCell>
                    <TableCell className="right">
                      <b>
                        {o
                          ? `${number(l.quantity * o.price, 2)} ${o.currency}`
                          : "–"}
                      </b>
                      <small>
                        {o?.leadDays
                          ? `Lieferzeit ca. ${o.leadDays} Spieltage`
                          : "Liefertermin ungeprüft"}
                      </small>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Position ${i + 1} entfernen`}
                        onClick={() =>
                          draft.setValue((v) => v.filter((_, j) => j !== i))
                        }
                        disabled={!draft.ready}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="action-bar">
          <div>
            <b>
              Gesamt:{" "}
              {Object.entries(totals)
                .map(([c, v]) => `${number(v, 2)} ${c}`)
                .join(" / ") || "–"}
            </b>
            <span role="status">{draft.status}</span>
          </div>
          <div>
            <Button
              variant="ghost"
              onClick={draft.reset}
              disabled={!draft.ready}
            >
              Zurücksetzen
            </Button>
            <Button
              variant="outline"
              disabled={!draft.ready || draft.busy}
              onClick={() => void draft.save()}
            >
              <Save size={14} />
              Entwurf speichern
            </Button>
            <Button
              disabled={draft.stale || invalid}
              onClick={() => setReview(true)}
            >
              Bestellung prüfen <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        title="Offene Bestellungen & Zugänge"
        subtitle="Eine Bestellnummer bestätigt noch keinen Wareneingang."
      >
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>SAP-Bestellung</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="right">Bestellte Menge</TableHead>
              <TableHead>Erwarteter Eingang</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.incoming
              .filter((i) => i.type === "Einkauf")
              .map((i) => (
                <TableRow key={`${i.id}:${i.product}`}>
                  <TableCell>
                    <b>{i.id}</b>
                  </TableCell>
                  <TableCell>{i.product}</TableCell>
                  <TableCell className="right">
                    {number(i.quantity)} {i.unit}
                  </TableCell>
                  <TableCell>
                    {i.due
                      ? gameDay(i.due, data.roundDays)
                      : "Noch nicht bestätigt"}
                  </TableCell>
                  <TableCell>
                    <span className="row-tag">{i.status}</span>
                    <small>Wareneingang gesondert bestätigen</small>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Panel>
      <Review
        data={data}
        baseVersion={draft.baseVersion}
        kind="purchase"
        payload={draft.value}
        rows={draft.value.map((l) => ({
          label: `${l.material} · Lieferant ${l.vendor}`,
          value: `+${number(l.quantity)} ${l.unit} · Lager ${l.location}`,
        }))}
        open={review}
        onOpenChange={setReview}
      />
    </>
  );
}

export function Production({ data }: { data: Snapshot }) {
  const recs = recommendations(data),
    days = Array.from({ length: 10 }, (_, i) => data.currentDay + i);
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Offene Produktionsaufträge"
          value={number(
            data.production.filter((p) => p.confirmed < p.target).length,
          )}
          note="Aufträge aus dem letzten bestätigten Stand"
        />
        <Metric
          label="Verbleibende Produktionsmenge"
          value={`${number(data.production.reduce((s, p) => s + Math.max(0, p.target - p.confirmed), 0))} ST`}
          note="Zielmenge abzüglich bestätigter Menge"
        />
        <Metric
          label="Potenzielle Fehlmengen"
          value={number(
            recs.filter((r) => r.shortage && r.shortage > 0).length,
          )}
          note="Produkte im Ausblick über fünf Spieltage"
          emphasis
        />
        <Metric
          label="Nächste Fertigstellung"
          value={
            data.production.filter(
              (p) => p.end !== null && p.confirmed < p.target,
            ).length
              ? gameDay(
                  Math.min(
                    ...data.production
                      .filter((p) => p.end !== null && p.confirmed < p.target)
                      .map((p) => p.end!),
                  ),
                  data.roundDays,
                )
              : "Unbekannt"
          }
          note="Aus dokumentierten Auftragsdaten"
        />
      </div>
      <Panel
        title="Produktionszeitplan"
        subtitle="Beginn und Ende aus dem Auftrag · Vorschau über zehn Spieltage"
      >
        <div className="table-wrap">
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Auftrag / Produkt</TableHead>
                <TableHead>Beginn → Ende</TableHead>
                <TableHead>Zeitplan</TableHead>
                <TableHead className="right">Ziel / Bestätigt</TableHead>
                <TableHead>Fortschritt</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.production.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <b>
                      {data.products.find((x) => x.id === p.product)?.name ??
                        p.product}
                    </b>
                    <small>
                      {p.id} · {p.product}
                    </small>
                  </TableCell>
                  <TableCell>
                    {gameDay(p.start, data.roundDays)}
                    <small>
                      →{" "}
                      {p.end
                        ? gameDay(p.end, data.roundDays)
                        : "Endtermin unbekannt"}
                    </small>
                  </TableCell>
                  <TableCell>
                    <div className="timeline-labels">
                      <span>{gameDay(days[0], data.roundDays)}</span>
                      <span>{gameDay(days.at(-1)!, data.roundDays)}</span>
                    </div>
                    <div
                      className="timeline"
                      role="img"
                      aria-label={`Auftrag von ${gameDay(p.start, data.roundDays)} bis ${p.end ? gameDay(p.end, data.roundDays) : "unbekannt"}`}
                    >
                      {days.map((d) => (
                        <span
                          key={d}
                          className={`${d >= p.start && p.end !== null && d <= p.end ? "filled" : ""} ${d === data.currentDay ? "current" : ""}`}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="right">
                    <b>{number(p.target)} ST</b>
                    <small>{number(p.confirmed)} ST bestätigt</small>
                  </TableCell>
                  <TableCell>
                    <Progress
                      value={
                        p.target
                          ? Math.min(100, (p.confirmed / p.target) * 100)
                          : 0
                      }
                    />
                    <small>
                      {number(Math.max(0, p.target - p.confirmed))} ST
                      verbleibend
                    </small>
                  </TableCell>
                  <TableCell>
                    <span className="row-tag">{p.status}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
      <div className="summary-grid">
        <Panel
          title="Nächste Produktionsentscheidungen"
          subtitle={`${gameDay(data.currentDay, data.roundDays)} bis ${gameDay(data.currentDay + 4, data.roundDays)}`}
        >
          {recs
            .filter((r) => r.shortage !== null && r.shortage > 0)
            .slice(0, 6)
            .map((r) => (
              <div className="suggestion" key={r.product.id}>
                <TrendingUp size={20} />
                <div>
                  <b>
                    {r.product.name} · {r.product.size}
                  </b>
                  <p>
                    Bedarf {number(r.demand)} ST − Bestand {number(r.stock)} ST
                    − rechtzeitige Zugänge {number(r.incoming)} ST.
                  </p>
                  <small>
                    Letzte Marktperiode: {number(r.marketDemand)} ST
                    Gesamtmarktnachfrage
                  </small>
                </div>
                <div>
                  <strong>{number(r.shortage)} ST</strong>
                  <small>Potenzielle Fehlmenge</small>
                </div>
              </div>
            ))}
          {!recs.some((r) => r.shortage !== null && r.shortage > 0) && (
            <div className="empty-state">
              Im betrachteten Zeitraum ist keine berechenbare Fehlmenge
              sichtbar.
            </div>
          )}
          <p className="subtle-note mt-4">
            Die Bedarfsprognose basiert auf eigenen Verkäufen. Die Marktmenge
            liefert Kontext; sie wird nicht als eigener Absatz angesetzt. Eine
            frühere Bestandslücke kann trotz späterem Zugang bestehen.
          </p>
        </Panel>
        <Panel
          title="Machbarkeit & Freigabe"
          subtitle="Vorschläge vor der Produktionsfreigabe prüfen"
        >
          <div className="suggestion">
            <AlertTriangle size={20} />
            <div>
              <b>Kapazität und Komponenten ungeprüft</b>
              <p>
                Ohne bestätigte Materialverfügbarkeit, Stücklisten, Rüstzeiten
                und freie Maschinenkapazität ist die vorgeschlagene Menge noch
                kein ausführbarer Produktionsplan.
              </p>
            </div>
          </div>
          <div className="suggestion">
            <Check size={20} />
            <div>
              <b>Freigabe erfolgt gesondert in SAP</b>
              <p>
                Dieses Dashboard analysiert Aufträge und Fehlmengen. Es führt
                keine automatische Produktionsfreigabe aus.
              </p>
            </div>
          </div>
          <div className="suggestion">
            <CircleHelp size={20} />
            <div>
              <b>Fertigstellung ist ein Plantermin</b>
              <p>
                Auftragsdaten zeigen den erwarteten Endtag. Ein tatsächlicher
                Zugang benötigt eine bestätigte Warenbewegung.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
