import OpenAI, { toFile } from 'openai';

export type SendResult = { success: boolean; data?: any; error?: string };

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppCredentials {
  accessToken?: string;
  phoneNumberId?: string;
  graphVersion?: string;
}

/**
 * Envio via Meta WhatsApp Cloud API oficial (Graph API) com suporte a botões interativos
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
 */
async function sendViaMetaCloudApi(
  cleanPhone: string,
  messageText: string,
  buttons?: WhatsAppButton[],
  customCreds?: WhatsAppCredentials
): Promise<SendResult> {
  const accessToken = (customCreds?.accessToken || process.env.META_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
  const phoneNumberId = (customCreds?.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '').replace(/['"]/g, '').trim();
  const graphVersion = (customCreds?.graphVersion || process.env.META_GRAPH_VERSION || 'v21.0').replace(/['"]/g, '').trim();

  try {
    let payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
    };

    if (buttons && buttons.length > 0) {
      payload.type = 'interactive';
      payload.interactive = {
        type: 'button',
        body: { text: messageText },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: {
              id: b.id,
              title: b.title.slice(0, 20), // Limite máximo da Meta é 20 caracteres por botão
            },
          })),
        },
      };
    } else {
      payload.type = 'text';
      payload.text = { preview_url: false, body: messageText };
    }

    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ Erro Meta Cloud API:', response.status, JSON.stringify(data));
      // Fallback: se falhou com botões interativos, tenta reenviar como texto simples
      if (buttons && buttons.length > 0) {
        console.warn('⚠️ Tentando fallback para texto simples na Meta Cloud API...');
        return sendViaMetaCloudApi(cleanPhone, messageText, undefined, customCreds);
      }
      return { success: false, error: `Meta API Error ${response.status}: ${data?.error?.message || 'desconhecido'}`, data };
    }
    return { success: true, data };
  } catch (err: any) {
    console.error('❌ Exceção ao enviar via Meta Cloud API:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Marca mensagem recebida como lida na Meta Cloud API (ativa os dois tracinhos azuis instantâneos)
 */
export async function markWhatsAppMessageAsRead(
  messageId: string,
  customCreds?: WhatsAppCredentials
): Promise<void> {
  try {
    const accessToken = (customCreds?.accessToken || process.env.META_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
    const phoneNumberId = (customCreds?.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '').replace(/['"]/g, '').trim();
    const graphVersion = (customCreds?.graphVersion || process.env.META_GRAPH_VERSION || 'v21.0').replace(/['"]/g, '').trim();

    if (!accessToken || !phoneNumberId || !messageId) return;

    fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    }).catch(() => {});
  } catch (e) {}
}

/**
 * Utilitário para envio de mensagens via API de WhatsApp
 * Suporta botões interativos clicáveis e texto simples com detecção automática de opções SIM/NÃO.
 * Suporta credenciais dinâmicas do Tenant e fallback para variáveis de ambiente.
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  messageText: string,
  explicitButtons?: WhatsAppButton[],
  customCreds?: WhatsAppCredentials
): Promise<SendResult> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'default';

  // Sanitizar telefone para formato E.164 limpo (apenas números)
  const cleanPhone = toPhone.replace(/\D/g, '');

  // Detectar automaticamente opções [1] SIM e [2] NÃO se nenhum botão for passado explicitamente
  let buttonsToSend = explicitButtons;
  let textToSend = messageText;

  if (!buttonsToSend) {
    const hasSimNao = /\[1\]\s*SIM[\s\S]*\[2\]\s*NÃO/i.test(messageText);
    if (hasSimNao) {
      buttonsToSend = [
        { id: 'btn_sim', title: 'SIM' },
        { id: 'btn_nao', title: 'NÃO' },
      ];
      // Limpa os sufixos "[1] SIM \n [2] NÃO" do corpo do texto para exibir os botões nativos limpos
      textToSend = messageText.replace(/\n+\s*\[1\]\s*SIM[\s\S]*\[2\]\s*NÃO\s*$/i, '').trim();
    }
  }

  console.log(
    `📱 [WhatsApp API Outbound] Para: ${cleanPhone} | Mensagem: "${textToSend.replace(/\n/g, ' ')}" | Botões: ${
      buttonsToSend ? buttonsToSend.map((b) => b.title).join(', ') : 'Nenhum'
    }`
  );

  // 1. Meta Cloud API oficial (dinâmica por tenant ou via .env)
  if (customCreds?.accessToken || (process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID)) {
    return sendViaMetaCloudApi(cleanPhone, textToSend, buttonsToSend, customCreds);
  }

  let formattedApiUrl = process.env.WHATSAPP_API_URL || '';
  if (formattedApiUrl && !formattedApiUrl.startsWith('http://') && !formattedApiUrl.startsWith('https://')) {
    formattedApiUrl = `https://${formattedApiUrl}`;
  }

  if (!formattedApiUrl || !apiKey || apiKey.includes('seu-token') || formattedApiUrl.includes('example')) {
    console.log('ℹ️ [WhatsApp Simulation] API de WhatsApp não configurada ou em modo simulação. Mensagem processada localmente.');
    return {
      success: true,
      data: { simulated: true, toPhone: cleanPhone, text: textToSend, buttons: buttonsToSend },
    };
  }

  try {
    // 2. Evolution API v1 / v2
    const targetEndpoint = buttonsToSend && buttonsToSend.length > 0
      ? `${formattedApiUrl.replace(/\/$/, '')}/message/sendButtons/${instanceName}`
      : `${formattedApiUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`;

    const payload = buttonsToSend && buttonsToSend.length > 0
      ? {
          number: cleanPhone,
          title: 'CliniDesk',
          description: textToSend,
          buttons: buttonsToSend.map((b) => ({
            type: 'reply',
            displayText: b.title,
            id: b.id,
          })),
        }
      : {
          number: cleanPhone,
          text: textToSend,
          options: { delay: 1200, presence: 'composing' },
        };

    const response = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('⚠️ Erro com endpoint de botões, tentando envio como texto:', response.status, errText);
      // Fallback para envio como texto se botões não forem suportados na instância
      const fallbackResp = await fetch(`${formattedApiUrl.replace(/\/$/, '')}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: messageText, // Envia o texto original completo com [1] SIM e [2] NÃO
          options: { delay: 1200, presence: 'composing' },
        }),
      });
      if (!fallbackResp.ok) {
        return { success: false, error: `WhatsApp API Error ${fallbackResp.status}` };
      }
      return { success: true, data: await fallbackResp.json() };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err: any) {
    console.error('❌ Exceção ao disparar mensagem no WhatsApp:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Baixa mídia (áudio, imagem, documento) da Meta WhatsApp Cloud API a partir do mediaId
 */
export async function downloadMetaMedia(
  mediaId: string,
  customCreds?: WhatsAppCredentials
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const accessToken = (customCreds?.accessToken || process.env.META_ACCESS_TOKEN || '').replace(/['"]/g, '').trim();
  const graphVersion = (customCreds?.graphVersion || process.env.META_GRAPH_VERSION || 'v21.0').replace(/['"]/g, '').trim();

  if (!accessToken || !mediaId) {
    console.warn('⚠️ [Meta Media] Access token ou mediaId ausente.');
    return null;
  }

  try {
    // 1. Obter URL temporária de download do arquivo
    const metaMediaUrl = `https://graph.facebook.com/${graphVersion}/${mediaId}`;
    const metaRes = await fetch(metaMediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      console.error(`❌ [Meta Media] Erro ao obter URL de mídia: ${metaRes.status} ${await metaRes.text()}`);
      return null;
    }

    const metaData = await metaRes.json();
    const directUrl = metaData.url;
    const mimeType = metaData.mime_type || 'audio/ogg';

    if (!directUrl) {
      console.error('❌ [Meta Media] URL de download não retornada pela Meta.');
      return null;
    }

    // 2. Fazer o download binário do arquivo
    const downloadRes = await fetch(directUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!downloadRes.ok) {
      console.error(`❌ [Meta Media] Falha no download do binário: ${downloadRes.status}`);
      return null;
    }

    const arrayBuffer = await downloadRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
    };
  } catch (err: any) {
    console.error('❌ [Meta Media] Exceção ao baixar mídia da Meta:', err.message);
    return null;
  }
}

/**
 * Transcreve áudio do WhatsApp (OGG / OPUS / MP3 / M4A) para texto usando OpenAI Whisper
 */
export async function transcribeAudioWithWhisper(audioBuffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes('sua-chave')) {
    console.warn('⚠️ [Whisper] OPENAI_API_KEY não configurada para transcrição de áudio.');
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });
    const file = await toFile(audioBuffer, 'audio.ogg', { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    });

    return transcription.text?.trim() || null;
  } catch (err: any) {
    console.error('❌ [Whisper] Erro na transcrição de áudio:', err.message);
    return null;
  }
}

