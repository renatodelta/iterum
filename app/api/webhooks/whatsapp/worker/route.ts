import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processAgentMessage } from '@/lib/ai/agent';
import {
  sendWhatsAppMessage,
  downloadMetaMedia,
  transcribeAudioWithWhisper,
  WhatsAppCredentials,
} from '@/lib/whatsapp/client';
import { WhatsAppMessageJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const job: WhatsAppMessageJob = await req.json();
    const { phoneNumberId, patientPhone, patientName, audioId } = job;
    let text = (job.text || '').trim();

    console.log(`⚡ [Worker Ingestion] Processando mensagem em fila para ${patientPhone} (PhoneID: ${phoneNumberId})`);

    // 1. Identificar o Tenant pelo phone_number_id cadastrado (ou fallback para a clínica padrão)
    let tenantConfig = await (prisma as any).tenantWhatsAppConfig?.findUnique({
      where: { phoneNumberId },
      include: { tenant: { include: { clinics: true } } },
    });

    let customCreds: WhatsAppCredentials | undefined = undefined;
    let clinic = tenantConfig?.tenant?.clinics?.[0] || null;

    if (tenantConfig && tenantConfig.isActive) {
      customCreds = {
        accessToken: tenantConfig.systemUserToken,
        phoneNumberId: tenantConfig.phoneNumberId,
      };
    }

    if (!clinic) {
      clinic = await prisma.clinic.findFirst();
    }

    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          name: 'Consultório Dra. Mariana Souza',
          doctorName: 'Dra. Mariana Souza',
          specialty: 'Pediatria',
          email: 'dra.mariana@iterum.med.br',
          phone: '+5511999999999',
          slotDurationMinutes: 30,
          minCancelHours: 2,
        },
      });
    }

    const cleanSender = patientPhone.replace(/\D/g, '');
    const formattedPhone = cleanSender.startsWith('55') ? `+${cleanSender}` : `+55${cleanSender}`;

    // 2. Transcrição de áudio se recebido
    if (audioId) {
      console.log(`🎙️ [Worker Audio] Baixando e transcrevendo áudio ${audioId}...`);
      const audioMedia = await downloadMetaMedia(audioId, customCreds);
      if (audioMedia?.buffer) {
        const transcribedText = await transcribeAudioWithWhisper(audioMedia.buffer, audioMedia.mimeType);
        if (transcribedText) {
          console.log(`📝 [Worker Transcrição] Áudio transcrito com sucesso: "${transcribedText}"`);
          text = transcribedText;
        } else {
          console.warn('⚠️ [Worker Transcrição] Falha ao transcrever áudio ou áudio inaudível.');
          text = 'Enviei um áudio, mas você não conseguiu ouvir com clareza.';
        }
      }
    }

    if (!text) {
      return NextResponse.json({ status: 'ignored', reason: 'Mensagem vazia após processamento' });
    }

    // 3. Localizar ou criar o paciente
    let patient = await prisma.patient.findFirst({
      where: {
        clinicId: clinic.id,
        phone: { contains: cleanSender.slice(-8) },
      },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: patientName || 'Paciente',
          phone: formattedPhone,
          tenantId: tenantConfig?.tenantId || undefined,
        },
      });
    }

    // 4. Checagem de Transbordo Humano (Human Handoff)
    const isPatientInHumanHandoff = Boolean((patient as any).humanHandoff);
    const isReactivateCommand = text.toLowerCase().trim() === '/bot' || text.toLowerCase().trim() === '/ia' || text.toLowerCase().trim() === '/reativar';

    if (isPatientInHumanHandoff) {
      if (isReactivateCommand) {
        // Reativar assistente virtual
        await (prisma.patient as any).update({
          where: { id: patient.id },
          data: { humanHandoff: false, humanHandoffAt: null },
        });
        const reactivateMsg = '🤖 O assistente virtual foi reativado. Como posso ajudar com sua consulta?';
        await sendWhatsAppMessage(formattedPhone, reactivateMsg, undefined, customCreds);
        return NextResponse.json({ success: true, message: 'Bot reativado' });
      }

      // Salva a mensagem no histórico para a recepcionista visualizar, mas NÃO responde automaticamente
      await prisma.message.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          role: 'user',
          content: audioId ? `🎤 ${text}` : text,
        },
      });
      console.log(`👤 [Human Handoff Ativo] Paciente ${patient.name} em atendimento humano. Mensagem arquivada sem intervenção da IA.`);
      return NextResponse.json({ success: true, status: 'human_handoff_active' });
    }

    // 5. Salvar mensagem do usuário
    const currentMsg = await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'user',
        content: audioId ? `🎤 ${text}` : text,
      },
    });

    // 5.1 DEBOUNCE INTELIGENTE (1.5 segundos):
    // Se o paciente enviou várias mensagens picadas em sequência, aguardamos para não encavalar respostas
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Verificar se existe uma mensagem mais recente deste paciente criada durante o intervalo
    const newerMsg = await prisma.message.findFirst({
      where: {
        patientId: patient.id,
        role: 'user',
        id: { not: currentMsg.id },
        createdAt: { gt: currentMsg.createdAt },
      },
    });

    if (newerMsg) {
      console.log(`⏭️ [Debounce] Nova mensagem recebida de ${patient.name}. O worker seguinte responderá o lote consolidado.`);
      return NextResponse.json({ status: 'debounced', supersededBy: newerMsg.id });
    }

    // 5.2 CONSOLIDAÇÃO DE MENSAGENS PENDENTES:
    // Localiza a última resposta do assistente para recuperar todas as mensagens pendentes do usuário
    const lastAssistantMsg = await prisma.message.findFirst({
      where: { patientId: patient.id, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
    });

    const pendingUserMessages = await prisma.message.findMany({
      where: {
        patientId: patient.id,
        role: 'user',
        ...(lastAssistantMsg ? { createdAt: { gt: lastAssistantMsg.createdAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    const consolidatedUserMessage = pendingUserMessages.length > 0
      ? pendingUserMessages.map((m) => m.content).join('\n')
      : text;

    // 6. Carregar histórico recente para a IA
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

    // 7. Processar com o motor de IA
    const agentResult = await processAgentMessage({
      patientPhone: formattedPhone,
      userMessage: consolidatedUserMessage,
      conversationHistory: history,
      clinicId: clinic.id,
      pushName: patientName || undefined,
    });

    // 8. Salvar resposta do assistente
    await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'assistant',
        content: agentResult.reply,
      },
    });

    // 9. Enviar resposta pelo WhatsApp usando credenciais dinâmicas do Tenant
    const whatsappResult = await sendWhatsAppMessage(formattedPhone, agentResult.reply, undefined, customCreds);

    console.log(`✅ [Worker Concluído] Resposta entregue para ${patient.name} (${formattedPhone})`);

    return NextResponse.json({
      success: true,
      patientId: patient.id,
      reply: agentResult.reply,
      whatsappResult,
    });
  } catch (error: any) {
    console.error('❌ Erro no Worker de WhatsApp:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

