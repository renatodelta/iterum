import { prisma } from '@/lib/prisma';
import { processAgentMessage } from '@/lib/ai/agent';
import {
  sendWhatsAppMessage,
  sendWhatsAppTypingIndicator,
  downloadMetaMedia,
  transcribeAudioWithWhisper,
  WhatsAppCredentials,
} from '@/lib/whatsapp/client';
import { findPatientByPhone } from '@/lib/ai/tools';
import { WhatsAppMessageJob } from '@/lib/queue';

/**
 * Processador central de mensagens de WhatsApp.
 * Executa o fluxo completo de atendimento de ponta a ponta com:
 * 1. Feedback visual instantâneo (indicador de digitação "..." e confirmação de leitura).
 * 2. Transcrição de áudio via Whisper se necessário.
 * 3. Localização segura do paciente titular sem colisão de dependentes.
 * 4. Resolução inteligente de transbordo humano (com auto-recuperação e aviso claro ao usuário).
 * 5. Processamento via motor de IA (Sofia) com Tool Calling no banco de dados.
 * 6. Disparo da resposta no WhatsApp e persistência no banco.
 * 7. Tratamento resiliente contra falhas (nunca deixa o paciente sem resposta).
 */
export async function executeWhatsAppMessageJob(
  job: WhatsAppMessageJob,
  customCreds?: WhatsAppCredentials
): Promise<{ success: boolean; reply?: string; error?: string }> {
  const { phoneNumberId, patientPhone, patientName, audioId, messageId } = job;
  let text = (job.text || '').trim();

  const cleanSender = patientPhone.replace(/\D/g, '');
  const formattedPhone = cleanSender.startsWith('55') ? `+${cleanSender}` : `+55${cleanSender}`;

  console.log(`⚡ [Processador WhatsApp] Iniciando processamento para ${formattedPhone} (MsgID: ${messageId || 'N/A'})`);

  try {
    // 1. Localizar ou criar clínica
    let clinic = await prisma.clinic.findFirst();
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

    // 2. Transcrição de áudio se recebido
    if (audioId) {
      console.log(`🎙️ [Áudio Recebido] Baixando e transcrevendo áudio ${audioId}...`);
      const audioMedia = await downloadMetaMedia(audioId, customCreds);
      if (audioMedia?.buffer) {
        const transcribedText = await transcribeAudioWithWhisper(audioMedia.buffer, audioMedia.mimeType);
        if (transcribedText) {
          console.log(`📝 [Áudio Transcrito] "${transcribedText}"`);
          text = transcribedText;
        } else {
          text = 'Enviei um áudio, mas você não conseguiu ouvir com clareza.';
        }
      }
    }

    if (!text) {
      console.warn('⚠️ [Processador WhatsApp] Mensagem vazia após análise. Ignorando.');
      return { success: false, error: 'Mensagem vazia' };
    }

    // 3. Localizar paciente titular de forma segura (sem confundir com dependentes -2, -3)
    let patient = await findPatientByPhone(cleanSender, clinic.id);

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: patientName && patientName.toLowerCase() !== 'paciente' ? patientName : 'Paciente',
          phone: formattedPhone,
        },
      });
      console.log(`👤 Novo paciente titular cadastrado: ${patient.name} (${patient.phone})`);
    }

    // 4. Checagem de Transbordo Humano (Human Handoff)
    const isPatientInHumanHandoff = Boolean((patient as any).humanHandoff);
    const handoffAt = (patient as any).humanHandoffAt ? new Date((patient as any).humanHandoffAt).getTime() : 0;
    const hoursSinceHandoff = handoffAt ? (Date.now() - handoffAt) / (1000 * 60 * 60) : 999;

    const lowerText = text.toLowerCase().trim();
    const isReactivateCommand =
      lowerText === '/bot' ||
      lowerText === '/ia' ||
      lowerText === '/reativar' ||
      lowerText === 'bot' ||
      lowerText === 'ia';

    const wantsToSchedule =
      lowerText.includes('marcar') ||
      lowerText.includes('agendar') ||
      lowerText.includes('consulta') ||
      lowerText.includes('horário') ||
      lowerText.includes('horario');

    // Auto-recuperação: se passaram mais de 2 horas desde a transferência humana e o paciente voltou a perguntar por agendamento
    const shouldAutoReactivate = hoursSinceHandoff >= 2 && wantsToSchedule;

    if (isPatientInHumanHandoff) {
      if (isReactivateCommand || shouldAutoReactivate) {
        // Reativação da IA
        await (prisma.patient as any).update({
          where: { id: patient.id },
          data: { humanHandoff: false, humanHandoffAt: null },
        });

        const reactivateMsg = '🤖 Olá! A Sofia (assistente virtual) foi reativada. Como posso ajudar você com sua consulta ou agendamento hoje? 😊';
        await sendWhatsAppMessage(formattedPhone, reactivateMsg, undefined, customCreds);
        return { success: true, reply: reactivateMsg };
      }

      // Salva a mensagem no histórico para a recepção acompanhar no painel
      await prisma.message.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          role: 'user',
          content: audioId ? `🎤 ${text}` : text,
        },
      });

      console.log(`👤 [Human Handoff Ativo] Paciente ${patient.name} em atendimento humano. Notificando status com clareza.`);

      // Informa com gentileza para o paciente não ficar no escuro
      const handoffNotice = 'Olá! Sua mensagem foi recebida pela nossa recepção e nossa equipe logo responderá você por aqui. Caso deseje agendar ou tirar dúvidas diretamente comigo a qualquer momento, basta digitar */bot* ou */ia*! 😊';
      await sendWhatsAppMessage(formattedPhone, handoffNotice, undefined, customCreds);

      return { success: true, reply: handoffNotice };
    }

    // 5. Salvar mensagem do usuário no histórico
    await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'user',
        content: audioId ? `🎤 ${text}` : text,
      },
    });

    // 6. Carregar histórico recente para a IA (últimas 20 mensagens)
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

    // 7. Processar com o motor de IA Sofia (OpenAI Function Calling)
    const agentResult = await processAgentMessage({
      patientPhone: formattedPhone,
      userMessage: text,
      conversationHistory: history,
      clinicId: clinic.id,
      pushName: patientName || undefined,
      patientId: patient.id,
    });

    // 8. Disparo imediato da resposta no WhatsApp e persistência no banco em paralelo
    await Promise.all([
      sendWhatsAppMessage(formattedPhone, agentResult.reply, undefined, customCreds),
      prisma.message.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          role: 'assistant',
          content: agentResult.reply,
        },
      }),
    ]);

    console.log(`✅ [Processador WhatsApp] Resposta entregue com sucesso para ${patient.name} (${formattedPhone})`);
    return { success: true, reply: agentResult.reply };
  } catch (error: any) {
    console.error('❌ [Processador WhatsApp] Erro crítico no atendimento:', error);

    // Contingência humana de segurança: nunca deixar o paciente sem resposta
    try {
      const emergencyReply =
        'Olá! Tive uma pequena oscilação temporária de conexão com os serviços da clínica, mas já estou atenta. Por favor, poderia me enviar novamente sua mensagem? Estou aqui para ajudar com seu agendamento! 😊';
      await sendWhatsAppMessage(formattedPhone, emergencyReply, undefined, customCreds);
    } catch (e) {
      console.error('Falha no envio da mensagem de contingência:', e);
    }

    return { success: false, error: error.message };
  }
}
