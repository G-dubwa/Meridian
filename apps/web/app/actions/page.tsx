import Link from 'next/link';
import { ActionsApp } from './actions-app';

export default function ActionsPage() {
  return (
    <main className="page-shell journal-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Internal action ledger</p>
          <h1>Tasks & reminders</h1>
          <p>
            Canonical intent only. Delivery remains undecided until the WP-11
            device spike.
          </p>
        </div>
        <nav className="button-row" aria-label="Action navigation">
          <Link href="/triage">Triage</Link>
          <Link href="/journal">Journal</Link>
        </nav>
      </header>
      <ActionsApp />
    </main>
  );
}
