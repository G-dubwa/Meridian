import { MicrosoftIntegrationPanel } from './microsoft-integration-panel';

export default function IntegrationsPage() {
  return (
    <main className="settings-shell">
      <p className="eyebrow">Settings</p>
      <h1>Integrations and consent</h1>
      <p className="lede">
        Connect Microsoft separately from local Meridian access and inspect the
        exact processing permissions retained in the consent ledger.
      </p>
      <MicrosoftIntegrationPanel />
    </main>
  );
}
