import Link from 'next/link';
import { WeeklyApp } from './weekly-app';

export default function WeeklyPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal Beta · evidence, not inference</p>
          <h1>The Weekly</h1>
          <p>
            Compare local plans with owner-confirmed execution. Elapsed time
            remains unknown until you provide evidence.
          </p>
        </div>
        <nav className="button-row" aria-label="Meridian">
          <Link href="/today">Today</Link>
          <Link href="/planning">Plan time</Link>
          <Link href="/goals">Goals</Link>
          <Link href="/knowledge">Knowledge</Link>
        </nav>
      </header>
      <WeeklyApp />
    </main>
  );
}
