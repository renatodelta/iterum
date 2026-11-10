import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export interface BlockedDateEntry {
  date: string; // YYYY-MM-DD
  shift: 'ALL' | 'MANHA' | 'TARDE';
  reason?: string;
  createdAt?: string;
}

// GET /api/clinic/blocked-dates - Lista de bloqueios de agenda (folgas, feriados, congressos)
export async function GET(req: NextRequest) {
  try {
    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ success: true, blockedDates: [] });
    }

    let meta: any = {};
    if (clinic.workingHours) {
      try {
        const wh = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        meta = wh?.meta || {};
      } catch (e) {}
    }

    const blockedDates: BlockedDateEntry[] = Array.isArray(meta.blockedDates) ? meta.blockedDates : [];

    return NextResponse.json({
      success: true,
      blockedDates,
    });
  } catch (error: any) {
    console.error('Erro em GET /api/clinic/blocked-dates:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/clinic/blocked-dates - Adicionar bloqueio de dia ou turno
export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { date, shift = 'ALL', reason = 'Compromisso / Bloqueio de Agenda' } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Data inválida. Use o formato AAAA-MM-DD.' }, { status: 400 });
    }

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Consultório não encontrado.' }, { status: 404 });
    }

    let wh: any = {};
    try {
      wh = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
    } catch {
      wh = {};
    }
    if (!wh.meta) wh.meta = {};

    let currentBlocked: BlockedDateEntry[] = Array.isArray(wh.meta.blockedDates) ? wh.meta.blockedDates : [];

    // Remove bloqueio prévio da mesma data/turno se já existia para substituir
    currentBlocked = currentBlocked.filter(
      (b) => !(b.date === date && (b.shift === shift || shift === 'ALL' || b.shift === 'ALL'))
    );

    const newEntry: BlockedDateEntry = {
      date,
      shift: shift as 'ALL' | 'MANHA' | 'TARDE',
      reason: reason.trim() || 'Compromisso / Folga',
      createdAt: new Date().toISOString(),
    };

    currentBlocked.push(newEntry);
    currentBlocked.sort((a, b) => a.date.localeCompare(b.date));

    wh.meta.blockedDates = currentBlocked;

    await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        workingHours: JSON.stringify(wh),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Bloqueio de ${shift === 'ALL' ? 'dia inteiro' : shift === 'MANHA' ? 'turno da manhã' : 'turno da tarde'} cadastrado com sucesso para ${date}.`,
      blockedDates: currentBlocked,
      created: newEntry,
    });
  } catch (error: any) {
    console.error('Erro em POST /api/clinic/blocked-dates:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/clinic/blocked-dates - Remover bloqueio de dia ou turno
export async function DELETE(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const shift = searchParams.get('shift');

    if (!date) {
      return NextResponse.json({ error: 'Parâmetro date é obrigatório.' }, { status: 400 });
    }

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Consultório não encontrado.' }, { status: 404 });
    }

    let wh: any = {};
    try {
      wh = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
    } catch {
      wh = {};
    }
    if (!wh.meta) wh.meta = {};

    let currentBlocked: BlockedDateEntry[] = Array.isArray(wh.meta.blockedDates) ? wh.meta.blockedDates : [];

    currentBlocked = currentBlocked.filter((b) => {
      if (b.date !== date) return true;
      if (shift && b.shift !== shift) return true;
      return false;
    });

    wh.meta.blockedDates = currentBlocked;

    await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        workingHours: JSON.stringify(wh),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Bloqueio removido com sucesso para ${date}.`,
      blockedDates: currentBlocked,
    });
  } catch (error: any) {
    console.error('Erro em DELETE /api/clinic/blocked-dates:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
