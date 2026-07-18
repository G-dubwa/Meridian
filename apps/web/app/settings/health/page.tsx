import { HealthPanel } from './health-panel';

export default function HealthPage() {
  return (
    <main className="page-shell auth-shell">
      <header className="page-header">
        <p className="eyebrow">Settings</p>
        <h1>System health</h1>
        <p>Queue state is visible without exposing journal content.</p>
      </header>
      <HealthPanel />
    </main>
  );
}
