import Link from 'next/link';
import { GoalsApp } from './goals-app';

export default function GoalsPage() {
  return (
    <main className="page-shell goals-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal Beta · local</p>
          <h1>Goals &amp; load</h1>
          <p>
            Owner-authored goals, explicit dependencies, and transparent soft
            load guidance. No model or external provider is involved.
          </p>
        </div>
        <nav className="button-row" aria-label="Meridian">
          <Link href="/today">Today</Link>
          <Link href="/weekly">The Weekly</Link>
          <Link href="/actions">Tasks &amp; reminders</Link>
          <Link href="/journal">Journal</Link>
        </nav>
      </header>
      <GoalsApp />
    </main>
  );
}
