import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Portão de segurança do sistema: tudo exige login, exceto as rotas públicas abaixo.
// (As rotas de API também se protegem sozinhas com requireAuth — defesa em profundidade.)

// Páginas e APIs abertas ao público (paciente agendando pelo site, login, webhooks que se autenticam sozinhos)
const PUBLIC_PATHS = [
  '/login',
  '/agendamento',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/appointments/availability',
  '/api/appointments/book',
  '/api/webhooks/whatsapp', // valida assinatura da Meta (GET: verify token; POST: x-hub-signature-256)
  '/api/webhooks/whatsapp/worker', // valida assinatura da fila
];

// Rotas que também podem ser chamadas por agendadores (cron) com `Authorization: Bearer <CRON_SECRET>`.
// A própria rota confere o segredo; aqui só deixamos passar para ela decidir.
const CRON_PATHS = ['/api/appointments/cron-reminders', '/api/patients/cron-birthday'];

// Entrada pública para o paciente entrar na fila de espera (a rota restringe o que é permitido sem login)
const PUBLIC_POST_PATHS = ['/api/waitlist'];

function matches(pathname: string, list: string[]) {
  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (matches(pathname, PUBLIC_PATHS)) return NextResponse.next();
  if (req.method === 'POST' && matches(pathname, PUBLIC_POST_PATHS)) return NextResponse.next();
  if (matches(pathname, CRON_PATHS) && (req.headers.get('authorization') || '').startsWith('Bearer ')) {
    return NextResponse.next();
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: 'Não autenticado. Faça login para continuar.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Proteção extra contra CSRF: requisições que alteram dados precisam vir do mesmo site
  if (isApi && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.headers.get('host')) {
      return NextResponse.json({ error: 'Origem da requisição não permitida.' }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Ignora arquivos estáticos do Next e imagens públicas
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif)$).*)'],
};
