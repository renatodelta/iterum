import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processAgentMessage } from '@/lib/ai/agent';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { patientPhone, messageText } = await req.json();

    if (!messageText) {
      return NextResponse.json({ error: 'Insira o texto da mensagem para simular.' }, { status: 400 });
    }

    const phoneToUse = patientPhone || '+5511999991111';

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica encontrada.' }, { status: 404 });
    }

    let patient = await prisma.patient.findFirst({
      where: {
        clinicId: clinic.id,
        phone: { contains: phoneToUse.replace(/\D/g, '').slice(-8) },
      },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: 'Paciente Teste (Simulador)',
          phone: phoneToUse,
        },
      });
    }

    // 1. Salvar mensagem do usuário
    await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'user',
        content: messageText,
      },
    });

    // 2. Carregar histórico
    const rawMessages = await prisma.message.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const recentMessages = rawMessages.reverse();

    const history = recentMessages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
    }));

    // 3. Processar mensagem com agente
    const agentResult = await processAgentMessage({
      patientPhone: phoneToUse,
      userMessage: messageText,
      conversationHistory: history,
      clinicId: clinic.id,
    });

    // 4. Salvar resposta
    await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'assistant',
        content: agentResult.reply,
      },
    });

    return NextResponse.json({
      success: true,
      patient,
      reply: agentResult.reply,
      toolsExecuted: agentResult.toolsExecuted,
    });
  } catch (error: any) {
    console.error('Erro na simulação do chat:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
