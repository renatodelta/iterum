import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyPassword } from '@/lib/password';
import { createSessionToken, isSessionConfigured, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/session';
import { safeEqual } from '@/lib/apiAuth';
import { getClientIp, rateLimit, resetRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const GENERIC_ERROR = 'Login ou senha inválidos.';
const WINDOW_MS = 15 * 60 * 1000;

// Hash falso usado só para gastar o mesmo tempo quando o usuário não existe (evita descobrir logins válidos)
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

// POST /api/auth/login - Autentica o usuário e abre a sessão (cookie HttpOnly)
export async function POST(req: NextRequest) {
  try {
    if (!isSessionConfigured()) {
      console.error('❌ [Auth] SESSION_SECRET não configurado (mínimo de 32 caracteres).');
      return NextResponse.json(
        { error: 'Servidor sem configuração de segurança. Defina SESSION_SECRET nas variáveis de ambiente.' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const login = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!login || !password || login.length > 120 || password.length > 256) {
      return NextResponse.json({ error: 'Informe login e senha.' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const ipKey = `login-ip:${ip}`;
    const userKey = `login-user:${ip}:${login}`;
    if (!rateLimit(ipKey, 20, WINDOW_MS) || !rateLimit(userKey, 5, WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' },
        { status: 429 }
      );
    }

    let sessionUser: { uid: string; name: string; login: string; role: string } | null = null;

    // 1. Usuários cadastrados no banco
    try {
      const dbUser = await prisma.user.findFirst({
        where: { OR: [{ login }, { email: login }] },
      });

      if (dbUser) {
        const result = await verifyPassword(password, dbUser.password);
        if (result.valid && dbUser.status === 'ACTIVE') {
          sessionUser = {
            uid: dbUser.id,
            name: dbUser.name,
            login: dbUser.login || dbUser.email,
            role: dbUser.role,
          };
          // Migra senhas antigas (texto puro) para hash no primeiro login bem-sucedido
          if (result.needsUpgrade) {
            const upgraded = await hashPassword(password);
            await prisma.user.update({ where: { id: dbUser.id }, data: { password: upgraded } }).catch(() => {});
          }
        }
      } else {
        await verifyPassword(password, DUMMY_HASH);
      }
    } catch (dbErr) {
      console.warn('⚠️ [Auth] Falha ao consultar usuários no banco:', (dbErr as Error).message);
    }

    // 2. Administrador de emergência definido nas variáveis de ambiente (ADMIN_LOGIN + ADMIN_PASSWORD_HASH)
    if (!sessionUser) {
      const adminLogin = (process.env.ADMIN_LOGIN || '').trim().toLowerCase();
      const adminHash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
      if (adminLogin && adminHash && safeEqual(login, adminLogin)) {
        const result = await verifyPassword(password, adminHash);
        if (result.valid && !result.needsUpgrade) {
          sessionUser = { uid: 'env-admin', name: 'Administrador', login: adminLogin, role: 'ADMIN' };
        }
      }
    }

    if (!sessionUser) {
      console.warn(`⚠️ [Auth] Tentativa de login inválida (IP ${ip}).`);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    resetRateLimit(userKey);

    const token = await createSessionToken(sessionUser);
    const res = NextResponse.json({
      success: true,
      user: { id: sessionUser.uid, name: sessionUser.name, login: sessionUser.login, role: sessionUser.role },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error: any) {
    console.error('❌ [Auth] Erro no login:', error.message);
    return NextResponse.json({ error: 'Não foi possível entrar agora. Tente novamente.' }, { status: 500 });
  }
}
