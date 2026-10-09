# ERPsim Cockpit

## This project is documented in salt.md — use it at every step

Decisions, tasks and documentation live at https://salt.vornis.de, workspace **VORNIS-Main** (`e100d3c5d0b55246c5318bee9b694be3`). Project page: `/p/f14ac9208434dd1e31ccad938dd90a74`.

- Read the workspace rules and the project page before substantive work.
- Check in with `working_on` before working; check out with `done: true` when finished.
- Record decisions on the page and noteworthy discoveries with `note` as they occur.

## Implementation boundaries

- Parent `sources/`, synced project files and user reference PDFs are read-only.
- No SAP endpoint is writable merely because it appears in `$metadata`.
- No browser/RPA helper, local PC agent, guessed write endpoint or fabricated SAP success.
- Keep personal drafts separate from shared confirmed snapshots. Preserve inputs on errors.
- Never resubmit an order with an unknown SAP outcome. Reconcile first.
- Credentials belong in server secrets only. Never commit `.env*`, logs, PDFs, screenshots or credentials.
- Use D1 migrations, never runtime schema creation. Keep applied migrations immutable.
- Run `npm test`, `npm run typecheck`, `npm run lint` and the Sites build before publishing.
