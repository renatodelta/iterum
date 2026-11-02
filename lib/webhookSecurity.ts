import { createHmac } from 'crypto';
import { safeEqual } from '@/lib/apiAuth';

// Verificações de autenticidade dos webhooks (quem está chamando é mesmo a Meta / a nossa fila?)

/**
 * Confere a assinatura `X-Hub-Signature-256` que a Meta envia em todo POST do webhook.
 * Requer a variável META_APP_SECRET (App Secret do aplicativo na Meta).
 * Em produção, sem o segredo configurado, tudo é recusado (falha segura).
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = (process.env.META_APP_SECRET || '').trim();

  if (!appSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ [Webhook WhatsApp] META_APP_SECRET não configurado: requisição recusada.');
      return false;
    }
    console.warn('⚠️ [Webhook WhatsApp] META_APP_SECRET ausente: assinatura NÃO verificada (somente ambiente de desenvolvimento).');
    return true;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return safeEqual(signatureHeader.slice('sha256='.length), expected);
}

/**
 * Para provedores alternativos (Evolution API / Z-API / formato genérico), que não assinam o corpo:
 * exige o header `x-webhook-secret` igual à variável WEBHOOK_SECRET. Sem a variável, esses formatos ficam desligados.
 */
export function hasValidWebhookSecret(req: Request): boolean {
  const secret = (process.env.WEBHOOK_SECRET || '').trim();
  if (secret.length < 16) return false;
  return safeEqual(req.headers.get('x-webhook-secret') || '', secret);
}

/** Segredo compartilhado entre o webhook e o worker da fila (reaproveita o CRON_SECRET). */
export function getQueueSecret(): string | null {
  const secret = (process.env.CRON_SECRET || '').trim();
  return secret.length >= 16 ? secret : null;
}

/** Confere o header `x-queue-signature` enviado pela fila ao worker. */
export function hasValidQueueSignature(req: Request): boolean {
  const secret = getQueueSecret();
  if (!secret) return false;
  return safeEqual(req.headers.get('x-queue-signature') || '', secret);
}
