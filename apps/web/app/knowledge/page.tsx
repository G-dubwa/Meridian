import Link from 'next/link';
import { KnowledgeApp } from './knowledge-app';

export default function KnowledgePage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Personal Beta · external evidence</p>
          <h1>Knowledge Library</h1>
          <p>
            Preserve and inspect owner-supplied sources without treating them as
            facts about you or activating a protocol.
          </p>
        </div>
        <nav className="button-row" aria-label="Meridian">
          <Link href="/today">Today</Link>
          <Link href="/weekly">The Weekly</Link>
          <Link href="/journal">Journal</Link>
        </nav>
      </header>
      <KnowledgeApp />
    </main>
  );
}
