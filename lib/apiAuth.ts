import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SessionPayload, verifySessionToken } from '@/lib/session';

/** Perfis que podem gerenciar usuários e configurações sensíveis. */
export const MANAGER_ROLES = ['ADMIN', 'MEDICO'];

/** Comparação de texto em tempo (quase) constante, para não vazar o segredo por tempo de resposta. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** Retorna a sessão do usuário logado (ou null). */
export async function getSession(req: Request): Promise<SessionPayload | null> {
  return verifySessionToken(readCookie(req, SESSION_COOKIE));
}

/** Confere o header `Authorization: Bearer <CRON_SECRET>` usado pelos agendadores (cron). */
export function hasValidCronSecret(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (secret.length < 16) return false; // sem segredo forte configurado, o acesso por cron fica desligado
  const header = req.headers.get('authorization') || '';
  return safeEqual(header, `Bearer ${secret}`);
}

export function unauthorizedResponse(message = 'Não autenticado. Faça login para continuar.') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Você não tem permissão para realizar esta ação.') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Proteção das rotas de API (defesa em profundidade, além do middleware).
 * Retorna `null` se o acesso estiver liberado; caso contrário, a resposta de erro pronta.
 *
 * - `roles`: exige que o usuário logado tenha um destes perfis.
 * - `allowCron`: também aceita o token de cron (`Authorization: Bearer <CRON_SECRET>`).
 */
export async function requireAuth(
  req: Request,
  options: { roles?: string[]; allowCron?: boolean } = {}
): Promise<NextResponse | null> {
  if (options.allowCron && hasValidCronSecret(req)) return null;

  const session = await getSession(req);
  if (!session) return unauthorizedResponse();

  if (options.roles && !options.roles.includes(session.role)) return forbiddenResponse();
  return null;
}
