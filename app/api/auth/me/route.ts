import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, unauthorizedResponse } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// GET /api/auth/me - Dados do usuário logado (sem senha)
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorizedResponse();

  let permissions: string[] = [];
  try {
    if (session.uid !== 'env-admin') {
      const dbUser = await prisma.user.findUnique({ where: { id: session.uid } });
      if (!dbUser || dbUser.status !== 'ACTIVE') return unauthorizedResponse('Sessão encerrada.');
      const parsed = JSON.parse(dbUser.permissions || '[]');
      permissions = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    permissions = [];
  }

  return NextResponse.json({
    user: { id: session.uid, name: session.name, login: session.login, role: session.role, permissions },
  });
}
