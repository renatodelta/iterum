import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { WhatsAppCredentials } from '@/lib/whatsapp/client';
import { WhatsAppMessageJob } from '@/lib/queue';
import { executeWhatsAppMessageJob } from '@/lib/whatsapp/processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const job: WhatsAppMessageJob = await req.json();
    const { phoneNumberId, patientPhone } = job;

    console.log(`⚡ [Worker Ingestion] Processando mensagem da fila para ${patientPhone} (PhoneID: ${phoneNumberId})`);

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
    console.error('❌ Erro no Worker de WhatsApp:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
