'use client';

export function readCsrfCookie(): string | null {
  const productionName = '__Host-meridian-csrf=';
  const developmentName = 'meridian-csrf=';
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(productionName))
      return decodeURIComponent(value.slice(productionName.length));
    if (value.startsWith(developmentName))
      return decodeURIComponent(value.slice(developmentName.length));
  }
  return null;
}

export async function issueCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Security token unavailable.');
  const body = (await response.json()) as { csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string')
    throw new Error('Security token unavailable.');
  return body.csrfToken;
}

export async function postWithCsrf(
  path: string,
  body: Readonly<Record<string, unknown>>,
  token = readCsrfCookie(),
): Promise<Response> {
  if (!token) throw new Error('Security token unavailable.');
  return fetch(path, {
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': token,
    },
    method: 'POST',
  });
}
