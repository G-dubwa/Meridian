import Link from 'next/link';
import { EntryDetail } from './entry-detail';

export default async function JournalEntryPage({
  params,
}: {
  readonly params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  return (
    <main className="page-shell journal-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Journal evidence</p>
          <h1>Entry detail</h1>
        </div>
        <Link href="/journal">Back to timeline</Link>
      </header>
      <EntryDetail entryId={entryId} />
    </main>
  );
}
