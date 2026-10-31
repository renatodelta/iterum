import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');
    if (secret !== 'diagnostico_iterum') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const patients = await prisma.patient.findMany({
      where: { phone: { contains: '991530244' } },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 15,
        },
      },
    });

    const recentAllMessages = await prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
      },
    });

    return NextResponse.json({
      patients,
      recentAllMessages,
      env: {
        hasQstash: !!process.env.QSTASH_TOKEN,
        hasRedis: !!process.env.UPSTASH_REDIS_REST_URL,
        hasMeta: !!process.env.META_ACCESS_TOKEN,
        metaPhoneId: process.env.META_PHONE_NUMBER_ID,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
