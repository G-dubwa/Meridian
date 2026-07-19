import Link from 'next/link';
import { JournalApp } from './journal-app';

export default function JournalPage() {
  return (
    <main className="page-shell journal-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Meridian</p>
          <h1>Journal</h1>
          <p>
            Source first. Every edit remains visible as an immutable revision.
          </p>
        </div>
        <nav className="button-row" aria-label="Journal navigation">
          <Link href="/actions">Tasks & reminders</Link>
          <Link href="/triage">Triage</Link>
          <Link href="/settings/security">Security</Link>
        </nav>
      </header>
      <JournalApp />
    </main>
  );
}
