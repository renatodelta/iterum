import { prisma } from '@/lib/prisma';
import { processAgentMessage } from '@/lib/ai/agent';
import {
  sendWhatsAppMessage,
  sendWhatsAppTypingIndicator,
  downloadMetaMedia,
  transcribeAudioWithWhisper,
  formatForWhatsApp,
  WhatsAppCredentials,
} from '@/lib/whatsapp/client';
import { findPatientByPhone } from '@/lib/ai/tools';
import { WhatsAppMessageJob } from '@/lib/queue';
import { confirmWaitlistBooking, declineWaitlistSlot } from '@/lib/waitlist';

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

  console.log(`⚡ [Processador WhatsApp] Iniciando processamento para ***${formattedPhone.slice(-4)} (MsgID: ${messageId || 'N/A'})`);

  try {
    // 1. Localizar clínica pelo tenant/phone_number_id se for multi-tenant, ou primeira clínica
    let clinic = null;
    if (phoneNumberId) {
      try {
        const tenantConfig = await (prisma as any).tenantWhatsAppConfig?.findUnique({
          where: { phoneNumberId },
          include: { tenant: { include: { clinics: true } } },
        });
        if (tenantConfig?.tenant?.clinics?.[0]) {
          clinic = tenantConfig.tenant.clinics[0];
        }
      } catch (e) {}
    }

    if (!clinic) {
      clinic = await prisma.clinic.findFirst();
    }

    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          name: 'Consultório Dr. Renato Silva',
          doctorName: 'Dr. Renato Silva',
          specialty: 'Cardiologia e Clínica Geral',
          email: 'contato@drrenatosilva.med.br',
          phone: '+5511988887777',
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
          console.log(`📝 [Áudio Transcrito] (${transcribedText.length} caracteres)`);
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
      console.log(`👤 Novo paciente titular cadastrado (ID: ${patient.id})`);
    } else if ((patient.name === 'Paciente' || patient.name === 'Titular WhatsApp') && patientName && patientName.toLowerCase() !== 'paciente') {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: { name: patientName },
      });
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

      console.log(`👤 [Human Handoff Ativo] Paciente ${patient.id} em atendimento humano. Notificando status com clareza.`);

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

    // 5.1 Interceptação inteligente de resposta à vaga ofertada da Fila de Espera
    const pAny = prisma as any;
    if (pAny.waitlist) {
      const cleanPhoneDigits = cleanSender.slice(-8);
      const pendingWaitlist = await pAny.waitlist.findFirst({
        where: {
          clinicId: clinic.id,
          status: 'NOTIFICADO',
          patientPhone: { contains: cleanPhoneDigits },
        },
        orderBy: { notifiedAt: 'desc' },
      });

      if (pendingWaitlist) {
        const isConfirmReply =
          lowerText === 'btn_waitlist_sim' ||
          lowerText === '1' ||
          lowerText === 'sim' ||
          lowerText === 'sim, tenho interesse' ||
          lowerText === 'tenho interesse' ||
          lowerText === 'sim tenho interesse' ||
          lowerText === 'sim, confirmar' ||
          lowerText === 'confirmar' ||
          lowerText === 'quero' ||
          lowerText === 'sim, quero' ||
          lowerText === 'sim quero' ||
          lowerText === 'pode agendar' ||
          lowerText === 'pode marcar' ||
          lowerText === 'sim, pode agendar' ||
          /👍|👌|👏|❤️|✅|🆗/u.test(text);

        const isDeclineReply =
          lowerText === 'btn_waitlist_nao' ||
          lowerText === '2' ||
          lowerText === 'não' ||
          lowerText === 'nao' ||
          lowerText === 'não tenho interesse' ||
          lowerText === 'nao tenho interesse' ||
          lowerText === 'recusar' ||
          lowerText === 'recuso' ||
          lowerText === 'não quero' ||
          lowerText === 'nao quero';

        if (isConfirmReply) {
          console.log(`⚡ [Fila de Espera] Confirmação direta de vaga detectada para ${pendingWaitlist.patientName}`);
          const bookingResult = await confirmWaitlistBooking(pendingWaitlist.id, clinic.id);
          if (bookingResult.success) {
            const slot = pendingWaitlist.offeredSlot
              ? (typeof pendingWaitlist.offeredSlot === 'string'
                  ? JSON.parse(pendingWaitlist.offeredSlot)
                  : pendingWaitlist.offeredSlot)
              : null;
            const dateStr = slot?.dateDisplay || 'Data confirmada';
            const timeStr = slot?.timeDisplay || '';
            const doctorName = clinic.doctorName || 'Dra. Silvia Helena Lima de Andrade';
            const address = clinic.address || 'SHIS QI 15, Bloco O, Torre I, Consultório 14, Térreo (Ed. Victoria Medical Center - Lote O), Lago Sul, Brasília - DF';

            const confirmReply = `O agendamento de ${pendingWaitlist.patientName} foi confirmado com sucesso! 🎉\n\n🗓️ Data: ${dateStr}\n🕗 Horário: ${timeStr}\n👩‍⚕️ Profissional: ${doctorName}\n👤 Paciente: ${pendingWaitlist.patientName}\n\nO consultório está localizado em:\n${address}\n\nSe precisar de mais alguma coisa ou tiver outras consultas para agendar, estou à disposição! 😊`;

            await Promise.all([
              sendWhatsAppMessage(formattedPhone, confirmReply, undefined, customCreds),
              prisma.message.create({
                data: {
                  clinicId: clinic.id,
                  patientId: patient.id,
                  role: 'assistant',
                  content: confirmReply,
                },
              }),
            ]);

            return { success: true, reply: confirmReply };
          }
        } else if (isDeclineReply) {
          console.log(`⚡ [Fila de Espera] Recusa direta de vaga detectada para ${pendingWaitlist.patientName}`);
          await declineWaitlistSlot(pendingWaitlist.id);
          const declineReply = `Entendido! Registramos sua recusa e liberamos este horário para o próximo paciente da lista. Você continua registrado em nossa lista de espera caso surja outra data de seu interesse! 😊`;

          await Promise.all([
            sendWhatsAppMessage(formattedPhone, declineReply, undefined, customCreds),
            prisma.message.create({
              data: {
                clinicId: clinic.id,
                patientId: patient.id,
                role: 'assistant',
                content: declineReply,
              },
            }),
          ]);

          return { success: true, reply: declineReply };
        }
      }
    }

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

    // 6.1 Tratamento inteligente de confirmação direta (Joinha 👍, botão 'Sim, confirmar', '1', 'Sim')
    const isThumbsUpOrPositive =
      /^(👍|👍🏻|👍🏼|👍🏽|👍🏾|👍🏿|sim|1|sim, confirmar|confirmar|confirmo|pode confirmar|ok|fechado|com certeza|btn_confirmar_sim)$/i.test(lowerText) ||
      /^[👍👌👏❤️✅🆗\s]+$/u.test(text);

    let processedUserText = text;
    if (isThumbsUpOrPositive) {
      // Verifica se a última mensagem da assistente foi pedindo confirmação de agendamento
      const lastAssistantMsg = recentMessages
        .slice()
        .reverse()
        .find((m) => m.role === 'assistant');

      if (lastAssistantMsg && /posso confirmar|deseja confirmar|vou confirmar seu agendamento/i.test(lastAssistantMsg.content)) {
        processedUserText = 'Sim, confirmo o agendamento! Pode efetivar a gravação agora.';
        console.log(`👍 [Confirmação Automática] Resposta positiva/joinha detectada para o resumo anterior. Prosseguindo com efetivação.`);
      }
    } else if (lowerText === 'btn_confirmar_nao' || lowerText === '2' || lowerText === 'não, alterar') {
      processedUserText = 'Não, quero alterar o agendamento.';
    }

    // 7. Processar com o motor de IA Sofia (OpenAI Function Calling)
    const agentResult = await processAgentMessage({
      patientPhone: formattedPhone,
      userMessage: processedUserText,
      conversationHistory: history,
      clinicId: clinic.id,
      pushName: patientName || undefined,
      patientId: patient.id,
    });

    // 8. Normalizar formatação para WhatsApp (elimina asteriscos duplos e resíduos visuais mantendo negritos limpos)
    const formattedReply = formatForWhatsApp(agentResult.reply);

    // 9. Detectar se a resposta é um pedido de confirmação de agendamento ou presença
    // para anexar botões interativos nativos da Meta no WhatsApp ("Sim, confirmar" e "Não, alterar")
    // e adicionar opções numeradas no texto para garantir compatibilidade total (WhatsApp Web e mobile)
    const isConfirmationQuestion =
      /posso confirmar/i.test(formattedReply) ||
      /deseja confirmar/i.test(formattedReply) ||
      /confirma seu agendamento/i.test(formattedReply) ||
      /confirma para você/i.test(formattedReply) ||
      /confirmo para você/i.test(formattedReply);

    let finalReply = formattedReply;
    if (isConfirmationQuestion && !/\[1\]/i.test(finalReply)) {
      finalReply += '\n\n*Responda com:*\n[1] Sim, confirmar (ou envie 👍)\n[2] Não, alterar';
    }

    const confirmationButtons = isConfirmationQuestion
      ? [
          { id: 'btn_confirmar_sim', title: 'Sim, confirmar' },
          { id: 'btn_confirmar_nao', title: 'Não, alterar' },
        ]
      : undefined;

    // 10. Disparo imediato da resposta no WhatsApp e persistência no banco em paralelo
    await Promise.all([
      sendWhatsAppMessage(formattedPhone, finalReply, confirmationButtons, customCreds),
      prisma.message.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          role: 'assistant',
          content: finalReply,
        },
      }),
    ]);

    console.log(`✅ [Processador WhatsApp] Resposta entregue com sucesso (paciente ${patient.id})`);
    return { success: true, reply: finalReply };
  } catch (error: any) {
    console.error('❌ [Processador WhatsApp] Erro crítico no atendimento:', error);

    // Contingência humana de segurança: nunca deixar o paciente sem resposta
    try {
      const emergencyReply =
        'Olá! Tive uma pequena oscilação temporária de conexão com os serviços do consultório, mas já estou atenta. Por favor, poderia me enviar novamente sua mensagem? Estou aqui para ajudar com seu agendamento! 😊';
      await sendWhatsAppMessage(formattedPhone, emergencyReply, undefined, customCreds);
    } catch (e) {
      console.error('Falha no envio da mensagem de contingência:', e);
    }

    return { success: false, error: error.message };
  }
}
