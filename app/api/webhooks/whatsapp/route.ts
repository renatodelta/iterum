import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppTypingIndicator, WhatsAppCredentials } from '@/lib/whatsapp/client';
import { enqueueWhatsAppMessage, qstashClient } from '@/lib/queue';
import { executeWhatsAppMessageJob } from '@/lib/whatsapp/processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Suporta execução estendida sem encerramento prematuro na Vercel

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
      hasQstash: !!process.env.QSTASH_TOKEN,
      nodeEnv: process.env.NODE_ENV,
    });
  }

  console.warn('⚠️ Tentativa de verificação do Webhook falhou. Token inválido.');
  return new NextResponse('Forbidden', { status: 403 });
}

// --------------------------------------------------------------------------
// 2. ENDPOINT POST: Recebimento e Processamento das Mensagens
// --------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('📩 [Webhook WhatsApp] Payload recebido:', JSON.stringify(body, null, 2));

    let senderPhone = '';
    let userText = '';
    let pushName = 'Paciente';
    let messageId: string | undefined = undefined;
    let audioId: string | undefined = undefined;
    let phoneNumberId = process.env.META_PHONE_NUMBER_ID || '';
    let timestamp: string | undefined = undefined;

    // 0. Parser para a Meta WhatsApp Cloud API Oficial
    if (body.object === 'whatsapp_business_account') {
      const change = body.entry?.[0]?.changes?.[0];
      const entryVal = change?.value;

      // Ignora eventos de status de entrega (sent, delivered, read)
      if (!entryVal?.messages || entryVal.messages.length === 0) {
        return new NextResponse('EVENT_RECEIVED', { status: 200 });
      }

      const msg = entryVal.messages[0];
      const metadata = entryVal.metadata;
      messageId = msg.id;
      senderPhone = msg.from?.replace(/\D/g, '') || '';
      pushName = entryVal.contacts?.[0]?.profile?.name || 'Paciente';
      phoneNumberId = metadata?.phone_number_id || phoneNumberId;
      timestamp = msg.timestamp;

      const isAudio = msg.type === 'audio' && msg.audio?.id;
      audioId = isAudio ? msg.audio.id : undefined;

      // Extrai texto de mensagens normais, respostas interativas ou áudio
      userText =
        msg.text?.body ||
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        msg.button?.text ||
        (isAudio ? '[Mensagem de Áudio]' : '');

      if (!senderPhone || (!userText.trim() && !isAudio)) {
        return new NextResponse('EVENT_RECEIVED', { status: 200 });
      }

      // Resolver credenciais customizadas se for tenant multi-empresa
      let customCreds: WhatsAppCredentials | undefined = undefined;
      try {
        const tenantConfig = await (prisma as any).tenantWhatsAppConfig?.findUnique({
          where: { phoneNumberId },
        });
        if (tenantConfig && tenantConfig.isActive) {
          customCreds = {
            accessToken: tenantConfig.systemUserToken,
            phoneNumberId: tenantConfig.phoneNumberId,
          };
        }
      } catch (e) {}

      // 1. FEEDBACK VISUAL INSTANTÂNEO (< 200ms)
      // Dispara o indicador de digitação ("digitando..." / 3 pontinhos animados) e os dois tracinhos azuis
      if (messageId) {
        sendWhatsAppTypingIndicator(messageId, senderPhone, customCreds).catch((e) =>
          console.warn('Aviso typing indicator:', e.message)
        );
      }

      const job = {
        phoneNumberId,
        patientPhone: senderPhone,
        patientName: pushName,
        messageId,
        text: userText,
        audioId,
        timestamp,
        rawPayload: msg,
      };

      // 2. Se houver QStash configurado, delega à fila
      if (qstashClient) {
        const hostUrl = req.headers.get('host') || undefined;
        await enqueueWhatsAppMessage(job, hostUrl);
        console.log(`⚡ [Webhook Meta] Mensagem de ${senderPhone} enfileirada no QStash com sucesso.`);
        return new NextResponse('EVENT_RECEIVED', { status: 200 });
      }

      // 3. EXECUÇÃO DIRETA ULTRA-RÁPIDA (sem intermediação externa, sem congelamento de promises no Vercel)
      console.log(`⚡ [Webhook Meta] Executando atendimento direto para ${senderPhone}...`);
      await executeWhatsAppMessageJob(job, customCreds);

      return new NextResponse('EVENT_RECEIVED', { status: 200 });
    }
    // 1. Parser para Evolution API (v1 / v2)
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
        messageId = msgData.key?.id;
      }
      // 2. Parser para Z-API
      else if (body.phone && (body.text?.message || body.isGroup === false)) {
        if (body.fromMe) {
          return NextResponse.json({ status: 'ignored', reason: 'Mensagem do próprio número' });
        }
        senderPhone = body.phone.replace(/\D/g, '');
        userText = body.text?.message || body.message || '';
        pushName = body.senderName || 'Paciente';
        messageId = body.messageId || body.id;
      }
      // 3. Parser Genérico / Direto
      else if (body.phone || body.from) {
        senderPhone = (body.phone || body.from).replace(/\D/g, '');
        userText = body.message || body.text || body.content || '';
        pushName = body.name || 'Paciente';
        messageId = body.id;
      }

      if (!senderPhone || !userText.trim()) {
        return NextResponse.json({ status: 'ignored', reason: 'Payload sem telefone ou texto válido' }, { status: 200 });
      }

      // Dispara indicador de digitação
      if (senderPhone) {
        sendWhatsAppTypingIndicator(messageId || 'generic', senderPhone).catch(() => {});
      }

      const job = {
        phoneNumberId,
        patientPhone: senderPhone,
        patientName: pushName,
        messageId,
        text: userText,
      };

      const result = await executeWhatsAppMessageJob(job);
      return NextResponse.json({ success: result.success, reply: result.reply });
    }
  } catch (error: any) {
    console.error('❌ Erro no Webhook de WhatsApp:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
