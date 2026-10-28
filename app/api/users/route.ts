import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateAutoLogin } from '@/lib/userPermissions';

export const dynamic = 'force-dynamic';

// Usuários do sistema (O médico titular da agenda + operadores/secretárias)
let memoryUsers: any[] = [
  {
    id: 'user-med-1',
    name: 'Dra. Mariana Souza',
    role: 'MEDICO',
    specialty: 'Pediatria',
    crm: 'CRM/SP 148.910',
    cpf: '111.222.333-44',
    email: 'dra.mariana@iterum.med.br',
    phone: '(11) 98888-7777',
    login: 'marianas',
    password: 'password123',
    permissions: [
      'visualizar_agenda',
      'configurar_perfil',
      'bloquear_horario',
      'agendamento',
      'desmarcacao',
      'remarcacao',
      'agendamento_extra',
      'dados_paciente',
      'gerar_agenda',
    ],
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'user-sec-2',
    name: 'Juliana Rocha Santos',
    role: 'SECRETARIA',
    specialty: 'Secretária Executiva & Atendimento',
    crm: null,
    cpf: '123.456.789-01',
    email: 'juliana.santos@consultorio.med.br',
    phone: '(11) 98765-4321',
    login: 'julianars',
    password: 'password123',
    permissions: [
      'visualizar_agenda',
      'bloquear_horario',
      'agendamento',
      'desmarcacao',
      'remarcacao',
      'agendamento_extra',
      'dados_paciente',
    ],
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function GET() {
  try {
    try {
      const dbUsers = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
      });

      if (dbUsers && dbUsers.length > 0) {
        const formatted = dbUsers.map((u) => {
          let perms: string[] = [];
          try {
            perms = typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions;
          } catch {
            perms = [];
          }
          return {
            ...u,
            permissions: Array.isArray(perms) ? perms : [],
          };
        });
        return NextResponse.json({ users: formatted });
      }
    } catch (dbErr) {
      console.warn('⚠️ [Users API] Falha no banco, utilizando lista em memória:', dbErr);
    }

    return NextResponse.json({ users: memoryUsers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
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

    // Gerar ou validar login automático
    const generatedLogin = customLogin?.trim() || generateAutoLogin(name, memoryUsers);
    const parsedPermissions = Array.isArray(permissions) ? permissions : [];

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
          password: password || '123456',
          role: role || 'SECRETARIA',
          permissions: JSON.stringify(parsedPermissions),
          status: status || 'ACTIVE',
        },
      });

      const userReturn = {
        ...newUser,
        permissions: parsedPermissions,
      };

      // Manter memória sincronizada
      memoryUsers.unshift(userReturn);

      return NextResponse.json({ success: true, user: userReturn });
    } catch (dbErr) {
      console.warn('⚠️ [Users API DB Create Error] Fallback para memória:', dbErr);

      const newUser = {
        id: `user-${Date.now()}`,
        name,
        specialty: specialty || 'Secretária',
        crm: crm || null,
        cpf: cpf || null,
        email,
        phone: phone || null,
        login: generatedLogin,
        password: password || '123456',
        role: role || 'SECRETARIA',
        permissions: parsedPermissions,
        status: status || 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      memoryUsers.unshift(newUser);
      return NextResponse.json({ success: true, user: newUser });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
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

    const parsedPermissions = Array.isArray(permissions) ? permissions : undefined;

    try {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (specialty !== undefined) updateData.specialty = specialty;
      if (crm !== undefined) updateData.crm = crm;
      if (cpf !== undefined) updateData.cpf = cpf;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (login !== undefined) updateData.login = login;
      if (password !== undefined) updateData.password = password;
      if (parsedPermissions !== undefined) updateData.permissions = JSON.stringify(parsedPermissions);
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
      });

      let retPerms = parsedPermissions;
      if (!retPerms) {
        try {
          retPerms = JSON.parse(updatedUser.permissions);
        } catch {
          retPerms = [];
        }
      }

      const userReturn = {
        ...updatedUser,
        permissions: retPerms,
      };

      // Atualizar também na memória
      const memIdx = memoryUsers.findIndex((u) => u.id === id);
      if (memIdx !== -1) {
        memoryUsers[memIdx] = userReturn;
      }

      return NextResponse.json({ success: true, user: userReturn });
    } catch (dbErr) {
      console.warn('⚠️ [Users API DB Update Error] Fallback para memória:', dbErr);
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
          password: password !== undefined ? password : memoryUsers[index].password,
          permissions: parsedPermissions !== undefined ? parsedPermissions : memoryUsers[index].permissions,
          role: role !== undefined ? role : memoryUsers[index].role,
          status: status !== undefined ? status : memoryUsers[index].status,
          updatedAt: new Date().toISOString(),
        };
        return NextResponse.json({ success: true, user: memoryUsers[index] });
      }
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 });
    }

    try {
      await prisma.user.delete({ where: { id } });
    } catch (dbErr) {
      console.warn('⚠️ [Users API DB Delete Error] Fallback para memória:', dbErr);
    }

    memoryUsers = memoryUsers.filter((u) => u.id !== id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
