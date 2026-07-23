import { TodayApp } from './today-app';

export default function TodayPage() {
  return (
    <main className="today-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Local Alpha</p>
          <h1>Today</h1>
          <p>
            Local priorities, agenda blocks, tasks, and reminders—without a
            provider dependency.
          </p>
        </div>
        <nav className="button-row" aria-label="Meridian">
          <a href="/actions">Tasks &amp; reminders</a>
          <a href="/goals">Goals</a>
          <a href="/journal">Journal</a>
          <a href="/triage">Triage</a>
        </nav>
      </header>
      <TodayApp />
    </main>
  );
}
