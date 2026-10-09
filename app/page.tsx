import { requireChatGPTUser } from "./chatgpt-auth";
import Dashboard from "@/components/dashboard";
import type { DashboardState } from "@/lib/snapshot-state";
import { dashboardSnapshot } from "@/lib/sync";
import { user as authorizedUser, ApiError } from "@/lib/server";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireChatGPTUser("/");
  let loaded: DashboardState = { snapshot: null, warning: null };
  let denied = false;
  try {
    await authorizedUser();
    loaded = await dashboardSnapshot();
  } catch (e) {
    denied = e instanceof ApiError && e.status === 403;
    loaded.warning = e instanceof ApiError ? e.message : "Die SAP-Daten konnten nicht geladen werden. Bitte erneut versuchen.";
  }
  if (denied)
    return (
      <main className="workspace">
        <h1>Zugang nicht freigeschaltet</h1>
        <p>
          Dein Konto gehört noch nicht zum konfigurierten Team. Bitte den
          Betreiber um Freigabe bitten.
        </p>
      </main>
    );
  return (
    <Dashboard
      user={user.displayName}
      initial={loaded.snapshot}
      initialWarning={loaded.warning}
    />
  );
}
