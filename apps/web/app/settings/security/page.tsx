import { SecurityPanel } from './security-panel';

export default function SecurityPage() {
  return (
    <main className="settings-shell">
      <p className="eyebrow">Settings</p>
      <h1>Security</h1>
      <p className="lede">
        Manage the local passphrase and revoke sessions without relying on a
        Microsoft account.
      </p>
      <SecurityPanel />
    </main>
  );
}
