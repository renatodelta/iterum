import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { WhatsAppCredentials } from '@/lib/whatsapp/client';
import { WhatsAppMessageJob } from '@/lib/queue';
import { executeWhatsAppMessageJob } from '@/lib/whatsapp/processor';
import { hasValidQueueSignature } from '@/lib/webhookSecurity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Só a nossa própria fila pode chamar este worker (ele dispara respostas reais no WhatsApp)
  if (!hasValidQueueSignature(req)) {
    console.warn('⚠️ [Worker Ingestion] Chamada sem assinatura válida: recusada.');
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const job: WhatsAppMessageJob = await req.json();
    const { phoneNumberId, patientPhone } = job;

    if (typeof phoneNumberId !== 'string' || typeof patientPhone !== 'string' || typeof job.text !== 'string') {
      return NextResponse.json({ error: 'Job inválido.' }, { status: 400 });
    }

    console.log('⚡ [Worker Ingestion] Processando mensagem da fila.');

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

    const result = await executeWhatsAppMessageJob(job, customCreds);
    return NextResponse.json({ success: result.success, reply: result.reply, error: result.error });
  } catch (error: any) {
    console.error('❌ Erro no Worker de WhatsApp:', error.message);
    return NextResponse.json({ error: 'Erro interno no worker.' }, { status: 500 });
  }
}
