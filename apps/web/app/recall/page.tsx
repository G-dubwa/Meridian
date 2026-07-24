import Link from 'next/link';
import { RecallApp } from './recall-app';

export default function RecallPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal v1 · local foundation</p>
          <h1>Recall</h1>
          <p>
            Search privacy-eligible personal and external evidence with an
            inspectable context manifest.
          </p>
        </div>
        <nav className="button-row" aria-label="Meridian">
          <Link href="/today">Today</Link>
          <Link href="/journal">Journal</Link>
          <Link href="/knowledge">Knowledge</Link>
        </nav>
      </header>
      <RecallApp />
    </main>
  );
}
