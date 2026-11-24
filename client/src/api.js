export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body || {};
  }
}

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'network' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Message lisible pour une erreur d'API (validation, conflit, réseau…). */
export function errorMessage(e) {
  if (e?.body?.message) return e.body.message;
  if (e?.body?.issues?.length) return e.body.issues.map((i) => i.message).join(' · ');
  if (e?.status === 0) return 'Serveur injoignable.';
  if (e?.status === 401) return 'Session expirée : reconnectez-vous.';
  return 'Une erreur est survenue.';
}

export const formatDate = (iso, withTime = false) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });

export const formatTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
