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
        <Link href="/settings/security">Security</Link>
      </header>
      <JournalApp />
    </main>
  );
}
