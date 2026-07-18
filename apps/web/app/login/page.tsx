import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <p className="eyebrow">Local owner access</p>
      <h1>Your diary does not depend on Microsoft.</h1>
      <p className="lede">
        Sign in with the local owner passphrase, or use one offline recovery
        code when the passphrase is unavailable.
      </p>
      <LoginForm />
    </main>
  );
}
