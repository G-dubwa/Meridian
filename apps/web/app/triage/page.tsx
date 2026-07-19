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
            Proposals only. Nothing here creates a task, reminder, memory, or
            external action.
          </p>
        </div>
        <Link href="/journal">Journal</Link>
      </header>
      <TriageApp />
    </main>
  );
}
