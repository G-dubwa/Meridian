'use client';

import { getWorkerHealthV1 } from '@meridian/api-contracts';
import type { WorkerHealthResponseV1 } from '@meridian/api-contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function HealthPanel() {
  const [health, setHealth] = useState<WorkerHealthResponseV1 | null>(null);
  const [message, setMessage] = useState('Loading worker health…');

  useEffect(() => {
    void getWorkerHealthV1()
      .then((value) => {
        setHealth(value);
        setMessage('');
      })
      .catch(() => {
        setMessage('Worker health is unavailable.');
      });
  }, []);

  return (
    <div className="security-grid">
      <section className="auth-card">
        <h2>Reliable work</h2>
        {message ? <p className="form-message">{message}</p> : null}
        {health ? (
          <dl>
            <div>
              <dt>Waiting</dt>
              <dd>{health.pending}</dd>
            </div>
            <div>
              <dt>In flight</dt>
              <dd>{health.inFlight}</dd>
            </div>
            <div>
              <dt>Succeeded</dt>
              <dd>{health.succeeded}</dd>
            </div>
            <div>
              <dt>Needs attention</dt>
              <dd>{health.failed + health.uncertain}</dd>
            </div>
            <div>
              <dt>Oldest unfinished</dt>
              <dd>
                {health.oldestUnfinishedAt
                  ? new Date(health.oldestUnfinishedAt).toLocaleString()
                  : 'None'}
              </dd>
            </div>
          </dl>
        ) : null}
        <p>
          <Link href="/settings/security">Back to Security</Link>
        </p>
      </section>

      <section className="auth-card">
        <h2>Dead letters</h2>
        {health?.deadLetters.length ? (
          <ul className="history-list">
            {health.deadLetters.map((letter) => (
              <li key={letter.outboxMessageId}>
                <strong>{letter.eventType}</strong>
                <span>
                  {letter.errorCode} after {letter.attempts} attempts ·{' '}
                  {new Date(letter.deadLetteredAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No dead-letter work is visible.</p>
        )}
      </section>
    </div>
  );
}
