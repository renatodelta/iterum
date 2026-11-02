import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateAutoLogin } from '@/lib/userPermissions';
import { getSession, requireAuth, MANAGER_ROLES, forbiddenResponse } from '@/lib/apiAuth';
import { hashPassword, validatePasswordStrength } from '@/lib/password';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['ADMIN', 'MEDICO', 'SECRETARIA'];

// Fallback em memória caso o banco esteja indisponível (começa vazio: nunca existem contas padrão)
let memoryUsers: any[] = [];

// Nunca devolve a senha (nem o hash) para o navegador
function toPublicUser(user: any, permissions?: string[]) {
  const { password, ...rest } = user;
  let perms = permissions;
  if (!perms) {
    try {
      const parsed = typeof rest.permissions === 'string' ? JSON.parse(rest.permissions) : rest.permissions;
      perms = Array.isArray(parsed) ? parsed : [];
    } catch {
      perms = [];
    }
  }
  return { ...rest, permissions: perms, hasPassword: !!password };
}

function isUniqueError(err: any) {
  return err?.code === 'P2002';
}

export async function GET(req: Request) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    try {
      const dbUsers = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
      });

      if (dbUsers && dbUsers.length > 0) {
        return NextResponse.json({ users: dbUsers.map((u) => toPublicUser(u)) });
      }
    } catch (dbErr) {
      console.warn('⚠️ [Users API] Falha no banco, utilizando lista em memória:', (dbErr as Error).message);
    }

    return NextResponse.json({ users: memoryUsers.map((u) => toPublicUser(u)) });
  } catch (error: any) {
    console.error('❌ [Users API] Erro em GET:', error.message);
    return NextResponse.json({ error: 'Erro ao listar usuários.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await requireAuth(req, { roles: MANAGER_ROLES });
  if (denied) return denied;

  try {
    const session = await getSession(req);
    const body = await req.json();
    const {
      name,
      specialty,
      crm,
      cpf,
      email,
      phone,
      login: customLogin,
      password,
      permissions,
      role,
      status,
    } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Nome Completo e E-mail são obrigatórios' }, { status: 400 });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const finalRole = VALID_ROLES.includes(role) ? role : 'SECRETARIA';
    // Somente um administrador pode criar outro administrador
    if (finalRole === 'ADMIN' && session?.role !== 'ADMIN') {
      return forbiddenResponse('Somente um administrador pode criar outro administrador.');
    }

    // Gerar ou validar login automático
    const generatedLogin = (customLogin?.trim() || generateAutoLogin(name, memoryUsers)).toLowerCase();
    const parsedPermissions = Array.isArray(permissions) ? permissions : [];
    const passwordHash = await hashPassword(password);

    try {
      const newUser = await prisma.user.create({
        data: {
          name,
          specialty: specialty || 'Secretária',
          crm: crm || null,
          cpf: cpf || null,
          email,
          phone: phone || null,
          login: generatedLogin,
          password: passwordHash,
          role: finalRole,
          permissions: JSON.stringify(parsedPermissions),
          status: status || 'ACTIVE',
        },
      });

      return NextResponse.json({ success: true, user: toPublicUser(newUser, parsedPermissions) });
    } catch (dbErr) {
      if (isUniqueError(dbErr)) {
        return NextResponse.json({ error: 'Já existe um usuário com este login ou e-mail.' }, { status: 409 });
      }
      console.warn('⚠️ [Users API DB Create Error] Fallback para memória:', (dbErr as Error).message);

      const newUser = {
        id: `user-${Date.now()}`,
        name,
        specialty: specialty || 'Secretária',
        crm: crm || null,
        cpf: cpf || null,
        email,
        phone: phone || null,
        login: generatedLogin,
        password: passwordHash,
        role: finalRole,
        permissions: parsedPermissions,
        status: status || 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      memoryUsers.unshift(newUser);
      return NextResponse.json({ success: true, user: toPublicUser(newUser, parsedPermissions) });
    }
  } catch (error: any) {
    console.error('❌ [Users API] Erro em POST:', error.message);
    return NextResponse.json({ error: 'Erro ao criar usuário.' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const denied = await requireAuth(req, { roles: MANAGER_ROLES });
  if (denied) return denied;

  try {
    const session = await getSession(req);
    const body = await req.json();
    const {
      id,
      name,
      specialty,
      crm,
      cpf,
      email,
      phone,
      login,
      password,
      permissions,
      role,
      status,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 });
    }

    // Senha em branco = manter a senha atual
    const hasNewPassword = typeof password === 'string' && password.length > 0;
    if (hasNewPassword) {
      const passwordError = validatePasswordStrength(password);
      if (passwordError) {
        return NextResponse.json({ error: passwordError }, { status: 400 });
      }
    }

    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Perfil de usuário inválido.' }, { status: 400 });
    }

    // Controle de escalonamento de privilégio
    if (session?.role !== 'ADMIN') {
      if (role === 'ADMIN') {
        return forbiddenResponse('Somente um administrador pode conceder perfil de administrador.');
      }
      const target = await prisma.user.findUnique({ where: { id } }).catch(() => null);
      if (target?.role === 'ADMIN') {
        return forbiddenResponse('Somente um administrador pode alterar outro administrador.');
      }
    }

    // Evita o usuário se trancar para fora do sistema
    if (id === session?.uid && status !== undefined && status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Você não pode desativar o seu próprio acesso.' }, { status: 400 });
    }

    const parsedPermissions = Array.isArray(permissions) ? permissions : undefined;
    const passwordHash = hasNewPassword ? await hashPassword(password) : undefined;

    try {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (specialty !== undefined) updateData.specialty = specialty;
      if (crm !== undefined) updateData.crm = crm;
      if (cpf !== undefined) updateData.cpf = cpf;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (login !== undefined) updateData.login = typeof login === 'string' ? login.trim().toLowerCase() : login;
      if (passwordHash) updateData.password = passwordHash;
      if (parsedPermissions !== undefined) updateData.permissions = JSON.stringify(parsedPermissions);
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json({ success: true, user: toPublicUser(updatedUser, parsedPermissions) });
    } catch (dbErr) {
      if (isUniqueError(dbErr)) {
        return NextResponse.json({ error: 'Já existe um usuário com este login ou e-mail.' }, { status: 409 });
      }
      console.warn('⚠️ [Users API DB Update Error] Fallback para memória:', (dbErr as Error).message);
      const index = memoryUsers.findIndex((u) => u.id === id);
      if (index !== -1) {
        memoryUsers[index] = {
          ...memoryUsers[index],
          name: name !== undefined ? name : memoryUsers[index].name,
          specialty: specialty !== undefined ? specialty : memoryUsers[index].specialty,
          crm: crm !== undefined ? crm : memoryUsers[index].crm,
          cpf: cpf !== undefined ? cpf : memoryUsers[index].cpf,
          email: email !== undefined ? email : memoryUsers[index].email,
          phone: phone !== undefined ? phone : memoryUsers[index].phone,
          login: login !== undefined ? login : memoryUsers[index].login,
          password: passwordHash || memoryUsers[index].password,
          permissions: parsedPermissions !== undefined ? parsedPermissions : memoryUsers[index].permissions,
          role: role !== undefined ? role : memoryUsers[index].role,
          status: status !== undefined ? status : memoryUsers[index].status,
          updatedAt: new Date().toISOString(),
        };
        return NextResponse.json({ success: true, user: toPublicUser(memoryUsers[index]) });
      }
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }
  } catch (error: any) {
    console.error('❌ [Users API] Erro em PUT:', error.message);
    return NextResponse.json({ error: 'Erro ao atualizar usuário.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAuth(req, { roles: MANAGER_ROLES });
  if (denied) return denied;

  try {
    const session = await getSession(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 });
    }

    if (id === session?.uid) {
      return NextResponse.json({ error: 'Você não pode remover o seu próprio acesso.' }, { status: 400 });
    }

    if (session?.role !== 'ADMIN') {
      const target = await prisma.user.findUnique({ where: { id } }).catch(() => null);
      if (target?.role === 'ADMIN') {
        return forbiddenResponse('Somente um administrador pode remover outro administrador.');
      }
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch (dbErr) {
      console.warn('⚠️ [Users API DB Delete Error] Fallback para memória:', (dbErr as Error).message);
    }

    memoryUsers = memoryUsers.filter((u) => u.id !== id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ [Users API] Erro em DELETE:', error.message);
    return NextResponse.json({ error: 'Erro ao remover usuário.' }, { status: 500 });
  }
}
