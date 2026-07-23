import Link from 'next/link';
import { PlanningApp } from './planning-app';

export default function PlanningPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal Beta · deterministic · local</p>
          <h1>Plan time</h1>
          <p>
            Preview exact local work blocks from owner-entered availability.
            Nothing is written to an external calendar.
          </p>
        </div>
        <nav className="button-row" aria-label="Meridian">
          <Link href="/today">Today</Link>
          <Link href="/goals">Goals</Link>
          <Link href="/actions">Tasks</Link>
        </nav>
      </header>
      <PlanningApp />
    </main>
  );
}
