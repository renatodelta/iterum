import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tenants/whatsapp/onboarding
 * Implementação estrita do Item 3.3 da Especificação Técnica:
 * 1. Troca o 'code' pelo access token
 * 2. Extrai o WABA ID via debug_token
 * 3. Recupera o Phone Number ID registrado
 * 4. Inscreve o aplicativo na WABA para receber eventos no Webhook central
 * 5. Salva ou atualiza a configuração do tenant no banco
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ error: 'Código de autorização da Meta não informado.' }, { status: 400 });
    }

    const tenantIdHeader = req.headers.get('x-tenant-id');
    const appId = (process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || '').trim();
    const appSecret = (process.env.META_APP_SECRET || '').trim();

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'Credenciais META_APP_ID e META_APP_SECRET não configuradas no servidor.' },
        { status: 500 }
      );
    }

    // 1. Troca o código pelo access token
    const tokenRes = await axios.get('https://graph.facebook.com/v21.0/oauth/access_token', {
      params: {
        client_id: appId,
        client_secret: appSecret,
        code: code,
      },
    });

    const accessToken = tokenRes.data.access_token;

    // 2. Extrai o WABA ID via debug_token
    const debugRes = await axios.get('https://graph.facebook.com/v21.0/debug_token', {
      params: {
        input_token: accessToken,
        access_token: `${appId}|${appSecret}`,
      },
    });

    const scopes = debugRes.data.data.granular_scopes || [];
    const whatsappScope = scopes.find((s: any) => s.scope === 'whatsapp_business_management');
    const wabaId = whatsappScope?.target_ids?.[0];

    if (!wabaId) {
      throw new Error('Não foi possível identificar o WABA ID nos escopos concedidos pelo usuário.');
    }

    // 3. Recupera o Phone Number ID registrado
    const phoneRes = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const primaryPhone = phoneRes.data.data?.[0];
    if (!primaryPhone) {
      throw new Error('Nenhum número de WhatsApp encontrado nesta conta comercial WABA.');
    }

    const phoneNumberId = primaryPhone.id;
    const displayPhoneNumber = primaryPhone.display_phone_number;

    // 4. Inscreve o aplicativo na WABA para receber eventos no Webhook central
    await axios.post(
      `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // 5. Salva ou atualiza o tenant e sua configuração no banco
    let tenantId = tenantIdHeader;
    const pAny = prisma as any;

    if (!tenantId) {
      // Localiza clínica atual ou primeiro tenant
      const defaultClinic = await prisma.clinic.findFirst();
      if (defaultClinic?.tenantId) {
        tenantId = defaultClinic.tenantId;
      } else {
        // Cria tenant padrão se não existir
        const newTenant = await pAny.tenant.create({
          data: {
            name: defaultClinic?.name || 'Clínica Principal',
            email: defaultClinic?.email || 'contato@iterum.med.br',
            status: 'ACTIVE',
          },
        });
        tenantId = newTenant.id;
        if (defaultClinic) {
          await prisma.clinic.update({
            where: { id: defaultClinic.id },
            data: { tenantId: newTenant.id },
          });
        }
      }
    }

    if (pAny.tenantWhatsAppConfig) {
      await pAny.tenantWhatsAppConfig.upsert({
        where: { tenantId: tenantId! },
        update: {
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          systemUserToken: accessToken,
          isActive: true,
        },
        create: {
          tenantId: tenantId!,
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          systemUserToken: accessToken,
          isActive: true,
        },
      });
    }

    console.log(`🎉 [Meta Onboarding] Tenant ${tenantId} conectado com sucesso ao WhatsApp ${displayPhoneNumber} (ID: ${phoneNumberId})`);

    return NextResponse.json({
      success: true,
      wabaId,
      phoneNumberId,
      displayPhoneNumber,
    });
  } catch (error: any) {
    console.error('❌ Erro no onboarding Meta:', error.response?.data || error.message);
    return NextResponse.json(
      { error: 'Erro ao conectar WhatsApp', details: error.response?.data?.error?.message || error.message },
      { status: 500 }
    );
  }
}
