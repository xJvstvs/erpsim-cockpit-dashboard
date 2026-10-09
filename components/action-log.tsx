"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Action } from "@/lib/action-engine";
const labels: Record<string, string> = {
  queued: "Vorgemerkt",
  running: "In Verarbeitung",
  succeeded: "Bestätigt",
  partial: "Teilerfolg",
  rejected: "Abgelehnt",
  unknown: "Ergebnis unklar – Abgleich nötig",
};
async function fetchActions(game: string) {
  const r = await fetch(`/api/actions?game=${encodeURIComponent(game)}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Aktionsprotokoll konnte nicht geladen werden.");
  return ((await r.json()) as { actions: Action[] }).actions;
}
export function ActionLog({ game }: { game: string }) {
  const [actions, setActions] = useState<Action[]>([]),
    [failure, setFailure] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const r = await fetch(`/api/actions?game=${encodeURIComponent(game)}`, {
        cache: "no-store",
      });
      if (!r.ok)
        throw new Error("Aktionsprotokoll konnte nicht geladen werden.");
      const b = (await r.json()) as { actions: Action[] };
      setActions(b.actions);
      setFailure(null);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    let active = true;
    fetchActions(game)
      .then((rows) => {
        if (active) {
          setActions(rows);
          setFailure(null);
        }
      })
      .catch((e) => {
        if (active) setFailure(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [game]);
  return (
    <section>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold">Aktionsprotokoll</h3>
        <Button variant="ghost" onClick={() => void load()}>
          Neu laden
        </Button>
      </div>
      {failure ? (
        <p className="text-sm amber" role="status">
          {failure}
        </p>
      ) : loading ? (
        <p className="text-sm muted">Protokoll wird geladen …</p>
      ) : !actions.length ? (
        <p className="text-sm muted">
          Noch keine SAP-Aktionen in dieser Spielinstanz. Persönliche Entwürfe
          sind keine SAP-Buchungen.
        </p>
      ) : (
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Zeit / Nutzer</TableHead>
              <TableHead>Aktion</TableHead>
              <TableHead>Ergebnis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  {new Date(a.createdAt).toLocaleString("de-DE")}
                  <small>{a.userName}</small>
                </TableCell>
                <TableCell>
                  {(
                    {
                      marketing: "Marketing",
                      prices: "Kanalpreise",
                      purchase: "Zusatzbestellung",
                    } as Record<string, string>
                  )[a.kind] ?? a.kind}
                  <small>{a.id}</small>
                </TableCell>
                <TableCell>
                  <b>{labels[a.status] ?? a.status}</b>
                  <details>
                    <summary className="text-xs cursor-pointer mt-1">
                      SAP-Rückmeldung
                    </summary>
                    <pre className="whitespace-pre-wrap break-all text-xs mt-2">
                      {JSON.stringify(a.result, null, 2)}
                    </pre>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
