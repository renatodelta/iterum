import { Client } from '@upstash/qstash';
import { Redis } from '@upstash/redis';

export interface WhatsAppMessageJob {
  phoneNumberId: string;
  patientPhone: string;
  patientName: string;
  messageId?: string;
  text: string;
  audioId?: string;
  timestamp?: string;
  rawPayload?: any;
}

// Inicialização segura com fallbacks caso as variáveis ainda não estejam preenchidas
const qstashToken = process.env.QSTASH_TOKEN || '';
const upstashRedisUrl = process.env.UPSTASH_REDIS_REST_URL || '';
const upstashRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const qstashClient = qstashToken ? new Client({ token: qstashToken }) : null;
export const redisClient = upstashRedisUrl && upstashRedisToken ? new Redis({ url: upstashRedisUrl, token: upstashRedisToken }) : null;

/**
 * Enfileira a mensagem recebida para processamento assíncrono.
 * Prioridade:
 * 1. QStash (se QSTASH_TOKEN estiver configurado, despacha para a URL do worker)
 * 2. Chamada HTTP assíncrona desacoplada em background (Fire-and-forget na própria Vercel)
 */
export async function enqueueWhatsAppMessage(job: WhatsAppMessageJob, hostUrl?: string): Promise<{ success: boolean; mode: string }> {
  const targetWorkerUrl =
    process.env.APP_URL ||
    (hostUrl ? (hostUrl.startsWith('http') ? hostUrl : `https://${hostUrl}`) : null) ||
    'https://clini-desk-kappa.vercel.app';

  const workerEndpoint = `${targetWorkerUrl}/api/webhooks/whatsapp/worker`;

  // 1. Tentar via QStash se configurado
  if (qstashClient) {
    try {
      await qstashClient.publishJSON({
        url: workerEndpoint,
        body: job,
        headers: {
          'x-queue-signature': process.env.CRON_SECRET || 'clinidesk-queue-token',
        },
      });
      return { success: true, mode: 'qstash' };
    } catch (err: any) {
      console.warn('⚠️ [Queue] Falha ao publicar no QStash, usando fallback assíncrono:', err.message);
    }
  }

  // 2. Fallback de disparo assíncrono direto (fire-and-forget)
  try {
    fetch(workerEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-queue-signature': process.env.CRON_SECRET || 'clinidesk-queue-token',
      },
      body: JSON.stringify(job),
    }).catch((err) => {
      console.error('❌ Erro background worker fetch:', err.message);
    });

    return { success: true, mode: 'fire-and-forget' };
  } catch (err: any) {
    console.error('❌ Erro ao enfileirar mensagem:', err.message);
    return { success: false, mode: 'error' };
  }
}
