import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { requireAuth } from '@/lib/apiAuth';
import { logAutomationAction } from '@/lib/automation-log';

export const dynamic = 'force-dynamic';

// GET /api/chat - Listar conversas ativas ou mensagens de um paciente específico
export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get('patientId');
    const clinicId = searchParams.get('clinicId');

    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) {
      return NextResponse.json({ error: 'Consultório não encontrado.' }, { status: 404 });
    }

    // CASO 1: Mensagens de um paciente específico
    if (patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
          name: true,
          phone: true,
          cpf: true,
          humanHandoff: true,
          humanHandoffAt: true,
          notes: true,
        },
      });

      if (!patient) {
        return NextResponse.json({ error: 'Paciente não encontrado.' }, { status: 404 });
      }

      const messages = await prisma.message.findMany({
        where: {
          patientId,
          clinicId: clinic.id,
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });

      return NextResponse.json({
        success: true,
        patient,
        messages,
      });
    }

    // CASO 2: Listar todas as conversas/threads da clínica
    const patientsWithMessages = await prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        cpf: true,
        humanHandoff: true,
        humanHandoffAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    const conversations = patientsWithMessages
      .map((p) => {
        const lastMsg = p.messages[0] || null;
        return {
          patientId: p.id,
          patientName: p.name,
          phone: p.phone,
          cpf: p.cpf,
          humanHandoff: Boolean(p.humanHandoff),
          humanHandoffAt: p.humanHandoffAt,
          totalMessages: p._count.messages,
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                role: lastMsg.role,
                content: lastMsg.content,
                createdAt: lastMsg.createdAt,
              }
            : null,
          lastActivityAt: lastMsg?.createdAt || new Date(0),
        };
      })
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error: any) {
    console.error('Erro em GET /api/chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/chat - Enviar mensagem manual da secretária pelo WhatsApp oficial
export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { patientId, text, clinicId } = body;

    if (!patientId || !text || !text.trim()) {
      return NextResponse.json({ error: 'patientId e text são obrigatórios.' }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: { clinic: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Paciente não encontrado.' }, { status: 404 });
    }

    const cleanText = text.trim();

    // 1. Gravar mensagem no histórico do banco como 'assistant' (mensagem da clínica/secretária)
    const newMessage = await prisma.message.create({
      data: {
        clinicId: patient.clinicId,
        patientId: patient.id,
        role: 'assistant',
        content: cleanText,
      },
    });

    // 2. Transbordo Humano Ativo: Quando a secretária responde manualmente, pausa a IA para evitar conflito
    if (!patient.humanHandoff) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: {
          humanHandoff: true,
          humanHandoffAt: new Date(),
        },
      });
    }

    // 3. Obter credenciais WABA customizadas se houver
    let customCreds: any = undefined;
    try {
      const pAny = prisma as any;
      if (pAny.tenantWhatsAppConfig && patient.tenantId) {
        const tenantConfig = await pAny.tenantWhatsAppConfig.findUnique({
          where: { tenantId: patient.tenantId },
        });
        if (tenantConfig && tenantConfig.isActive) {
          customCreds = {
            phoneNumberId: tenantConfig.phoneNumberId,
            accessToken: tenantConfig.systemUserToken,
            wabaId: tenantConfig.wabaId,
          };
        }
      }
    } catch (e) {}

    // 4. Disparar via WhatsApp Oficial (Meta Cloud API)
    const sendResult = await sendWhatsAppMessage(patient.phone, cleanText, undefined, customCreds);

    // 5. Registrar no feed de Ações de Automação
    logAutomationAction({
      type: 'ATENDIMENTO_HUMANO',
      title: 'Mensagem Manual Enviada (Secretária)',
      description: `Mensagem enviada para ${patient.name} (${patient.phone}): "${cleanText.slice(0, 70)}${cleanText.length > 70 ? '...' : ''}"`,
      patientName: patient.name,
      patientPhone: patient.phone,
      patientCpf: patient.cpf || undefined,
      origin: 'PAINEL_SECRETARIA',
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: newMessage,
      sendResult,
      humanHandoff: true,
    });
  } catch (error: any) {
    console.error('Erro em POST /api/chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/chat - Ativar ou Desativar Transbordo Humano (Ligar/Desligar Sofia)
export async function PATCH(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { patientId, humanHandoff } = body;

    if (!patientId || typeof humanHandoff !== 'boolean') {
      return NextResponse.json({ error: 'patientId e humanHandoff (boolean) são obrigatórios.' }, { status: 400 });
    }

    const updated = await prisma.patient.update({
      where: { id: patientId },
      data: {
        humanHandoff,
        humanHandoffAt: humanHandoff ? new Date() : null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        humanHandoff: true,
        humanHandoffAt: true,
      },
    });

    logAutomationAction({
      type: 'ATENDIMENTO_HUMANO',
      title: humanHandoff ? 'Intervenção Humana Ativada' : 'Sofia IA Reativada',
      description: humanHandoff
        ? `Secretária pausou a Sofia para atender manualmente o paciente ${updated.name}.`
        : `Secretária reativou o atendimento da Sofia para o paciente ${updated.name}.`,
      patientName: updated.name,
      patientPhone: updated.phone,
      origin: 'PAINEL_SECRETARIA',
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      patient: updated,
    });
  } catch (error: any) {
    console.error('Erro em PATCH /api/chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
