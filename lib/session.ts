// Sessão por cookie assinado (HMAC-SHA256). Usa apenas Web Crypto, então funciona tanto nas
// rotas de API (Node) quanto no middleware (Edge). Não guarda a senha nem dados sensíveis.

export const SESSION_COOKIE = 'iterum_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas

export interface SessionPayload {
  uid: string;
  name: string;
  login: string;
  role: string; // ADMIN, MEDICO, SECRETARIA
  exp: number; // epoch em segundos
}

const encoder = new TextEncoder();

function getSecret(): string | null {
  const secret = (process.env.SESSION_SECRET || '').trim();
  return secret.length >= 32 ? secret : null;
}

export function isSessionConfigured(): boolean {
  return getSecret() !== null;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Cria o valor do cookie de sessão. Lança erro se SESSION_SECRET não estiver configurado. */
export async function createSessionToken(
  data: Omit<SessionPayload, 'exp'>,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  const secret = getSecret();
  if (!secret) {
    throw new Error('SESSION_SECRET não configurado (mínimo de 32 caracteres).');
  }
  const payload: SessionPayload = { ...data, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

/** Valida assinatura e validade do cookie. Retorna null se for inválido, adulterado ou expirado. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  try {
    const secret = getSecret();
    if (!secret || !token) return null;

    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const key = await getKey(secret);
    // crypto.subtle.verify compara em tempo constante.
    const ok = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(body));
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (!payload?.uid || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
