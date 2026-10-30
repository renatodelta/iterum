import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processAgentMessage } from '@/lib/ai/agent';
import { sendWhatsAppMessage } from '@/lib/whatsapp/client';
import { enqueueWhatsAppMessage } from '@/lib/queue';

export const dynamic = 'force-dynamic';

// --------------------------------------------------------------------------
// 1. ENDPOINT GET: Verificação obrigatória do Webhook pela Meta
// --------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = (process.env.VERIFY_TOKEN || 'meu_token_secreto_123').replace(/['"]/g, '').trim();

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Webhook da Meta verificado com sucesso!');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Diagnóstico das variáveis de ambiente na Vercel
  if (searchParams.get('debug') === 'env') {
    return NextResponse.json({
      hasMetaToken: !!process.env.META_ACCESS_TOKEN,
      metaTokenPrefix: process.env.META_ACCESS_TOKEN ? process.env.META_ACCESS_TOKEN.slice(0, 8) : null,
      metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID || null,
      metaGraphVersion: process.env.META_GRAPH_VERSION || null,
      hasOpenAiKey: !!process.env.OPENAI_API_KEY,
      nodeEnv: process.env.NODE_ENV,
    });
  }

  console.warn('⚠️ Tentativa de verificação do Webhook falhou. Token inválido.');
  return new NextResponse('Forbidden', { status: 403 });
}

// --------------------------------------------------------------------------
// 2. ENDPOINT POST: Recebimento das Mensagens
// --------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('📩 [Webhook WhatsApp] Mensagem recebida:', JSON.stringify(body, null, 2));

    let senderPhone = '';
    let userText = '';
    let pushName = 'Paciente';

    // 0. Parser para a Meta WhatsApp Cloud API Oficial (Conforme Especificação Técnica)
    if (body.object === 'whatsapp_business_account') {
      const change = body.entry?.[0]?.changes?.[0];
      const entryVal = change?.value;

      // Ignora eventos de status (entregue, lido, etc.)
      if (!entryVal?.messages || entryVal.messages.length === 0) {
        return new NextResponse('EVENT_RECEIVED', { status: 200 });
      }

      const msg = entryVal.messages[0];
      const metadata = entryVal.metadata;
      senderPhone = msg.from?.replace(/\D/g, '') || '';
      pushName = entryVal.contacts?.[0]?.profile?.name || 'Paciente';

      const isAudio = msg.type === 'audio' && msg.audio?.id;
      const audioId = isAudio ? msg.audio.id : undefined;

      // Extrai texto de mensagens normais, respostas interativas ou marca áudio
      userText =
        msg.text?.body ||
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        msg.button?.text ||
        (isAudio ? '[Mensagem de Áudio]' : '');

      if (senderPhone && (userText.trim() || isAudio)) {
        const hostUrl = req.headers.get('host') || undefined;

        // Despacha para a fila assíncrona / worker imediatamente
        await enqueueWhatsAppMessage({
          phoneNumberId: metadata?.phone_number_id || process.env.META_PHONE_NUMBER_ID || '',
          patientPhone: senderPhone,
          patientName: pushName,
          messageId: msg.id,
          text: userText,
          audioId,
          timestamp: msg.timestamp,
          rawPayload: msg,
        }, hostUrl);

        console.log(`⚡ [Webhook Meta] Mensagem (${isAudio ? 'Áudio' : 'Texto'}) de ${senderPhone} enfileirada com sucesso. Respondendo 200 OK.`);

        // Retorna HTTP 200 instantâneo para a Meta não realizar retentativas
        return new NextResponse('EVENT_RECEIVED', { status: 200 });
      }
    }
    // 1. Parser para Evolution API (v1 / v2, case-insensitive)
    else {
      const eventName = (body.event || '').toLowerCase();
      const isEvolutionEvent =
        eventName.includes('messages') ||
        eventName.includes('upsert') ||
        body.data?.key ||
        (Array.isArray(body.data) && body.data[0]?.key);

      if (isEvolutionEvent && body.data) {
        const msgData = Array.isArray(body.data) ? body.data[0] : body.data;

        if (msgData.key?.fromMe) {
          return NextResponse.json({ status: 'ignored', reason: 'Mensagem enviada pela própria instância' });
        }

        const rawJid = msgData.key?.remoteJid || msgData.key?.participant || '';
        senderPhone = rawJid.replace('@s.whatsapp.net', '').replace('@g.us', '').replace(/\D/g, '');

        userText =
          msgData.message?.conversation ||
          msgData.message?.extendedTextMessage?.text ||
          msgData.message?.buttonsResponseMessage?.selectedButtonId ||
          msgData.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
          '';

        pushName = msgData.pushName || body.senderName || 'Paciente';
      }
      // 2. Parser para Z-API
      else if (body.phone && (body.text?.message || body.isGroup === false)) {
        if (body.fromMe) {
          return NextResponse.json({ status: 'ignored', reason: 'Mensagem do próprio número' });
        }
        senderPhone = body.phone.replace(/\D/g, '');
        userText = body.text?.message || body.message || '';
        pushName = body.senderName || 'Paciente';
      }
      // 3. Parser Genérico / Direto
      else if (body.phone || body.from) {
        senderPhone = (body.phone || body.from).replace(/\D/g, '');
        userText = body.message || body.text || body.content || '';
        pushName = body.name || 'Paciente';
      }
    }

    if (!senderPhone || !userText.trim()) {
      return NextResponse.json({ status: 'ignored', reason: 'Payload sem telefone ou conteúdo válido' }, { status: 200 });
    }

    // Formatar telefone para padrão internacional E.164 (+55...)
    const formattedPhone = senderPhone.startsWith('55') ? `+${senderPhone}` : `+55${senderPhone}`;

    // Buscar primeira clínica cadastrada ou criar padrão se o banco for novo
    let clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          name: 'Consultório Dra. Mariana Souza',
          doctorName: 'Dra. Mariana Souza',
          crm: 'CRM/SP 148.910',
          specialty: 'Pediatria',
          email: 'dra.mariana@iterum.med.br',
          phone: '+5511999999999',
          slotDurationMinutes: 30,
          minCancelHours: 2,
        },
      });
    }

    // Sanitização do nome de perfil recebido pelo WhatsApp
    const cleanedPush = pushName
      ? pushName
          .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '')
          .replace(/[^\p{L}\s.'-]/gu, '')
          .trim()
      : '';
    const safePushName = cleanedPush && cleanedPush.length >= 2 && cleanedPush.toLowerCase() !== 'paciente' ? cleanedPush : '';

    // Buscar ou criar paciente no banco de dados
    let patient = await prisma.patient.findFirst({
      where: {
        clinicId: clinic.id,
        phone: { contains: senderPhone.slice(-8) },
      },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: safePushName || pushName || 'Paciente',
          phone: formattedPhone,
        },
      });
      console.log(`👤 Novo paciente cadastrado automaticamente: ${patient.name} (${patient.phone})`);
    } else if (safePushName) {
      // Se o titular mandou mensagem e seu nome no banco difere completamente do pushName
      // (ex: foi sobrescrito para o nome de um terceiro como "Júlio"), sincronizamos de volta para o dono do WhatsApp
      const currentLower = (patient.name || '').toLowerCase().trim();
      const pushFirst = safePushName.toLowerCase().split(' ')[0];
      if (!currentLower.includes(pushFirst)) {
        console.log(`🔄 Restaurando nome do titular do WhatsApp no cadastro: de "${patient.name}" para "${safePushName}"`);
        patient = await prisma.patient.update({
          where: { id: patient.id },
          data: { name: safePushName },
        });
      }
    }

    // 1. Salvar mensagem recebida do usuário no histórico
    await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'user',
        content: userText,
      },
    });

    // 2. Carregar histórico recente de mensagens (últimas 20 mais recentes)
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

    // 3. Processar mensagem através do motor de IA & Tool Calling
    const agentResult = await processAgentMessage({
      patientPhone: formattedPhone,
      userMessage: userText,
      conversationHistory: history,
      clinicId: clinic.id,
      pushName: safePushName || undefined,
    });

    // 4. Salvar resposta do assistente no banco
    await prisma.message.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        role: 'assistant',
        content: agentResult.reply,
      },
    });

    // 5. Disparar resposta para o WhatsApp do paciente via REST API
    const whatsappResult = await sendWhatsAppMessage(formattedPhone, agentResult.reply);

    return NextResponse.json({
      success: true,
      patient: { id: patient.id, name: patient.name, phone: patient.phone },
      agentReply: agentResult.reply,
      toolsExecuted: agentResult.toolsExecuted,
      whatsappResult,
    });
  } catch (error: any) {
    console.error('❌ Erro no processamento do Webhook de WhatsApp:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}