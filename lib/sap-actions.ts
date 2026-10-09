import type { VerifiedAdapter } from "./action-engine";
/** Add an adapter only after validating a real endpoint, permission, CSRF/session handling,
 * item-level result parsing, reconciliation and ERPsim quantity semantics in this tenant.
 * The R12 read service does not document these write contracts. No browser/RPA fallback. */
const adapters: Readonly<Record<string, VerifiedAdapter>> = Object.freeze({});
export function actionAdapter(kind: string) {
  return adapters[kind] ?? null;
}
