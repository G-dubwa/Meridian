import Link from 'next/link';
import { TriageApp } from './triage-app';

export default function TriagePage() {
  return (
    <main className="page-shell journal-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Owner review</p>
          <h1>Triage</h1>
          <p>
            Accepting a task or reminder proposal creates only its internal
            canonical target. External actions remain unavailable.
          </p>
        </div>
        <nav className="button-row" aria-label="Triage navigation">
          <Link href="/actions">Tasks & reminders</Link>
          <Link href="/journal">Journal</Link>
        </nav>
      </header>
      <TriageApp />
    </main>
  );
}
