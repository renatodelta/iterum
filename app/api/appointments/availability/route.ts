import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buscarHorariosDisponiveis } from '@/lib/ai/tools';
import { getDoctorInfo } from '@/lib/ai/agent';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// GET /api/appointments/availability?month=YYYY-MM
// Retorna os horários disponíveis para todos os dias do mês solicitado
export async function GET(req: NextRequest) {
  try {
    // Rota pública (página de agendamento): limite por IP porque a consulta é pesada (calcula o mês inteiro)
    if (!rateLimit(`availability:${getClientIp(req)}`, 60, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Muitas consultas. Aguarde alguns minutos.' }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month'); // Ex: 2026-10

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica cadastrada.' }, { status: 404 });
    }

    const doctor = await getDoctorInfo(clinic.id);

    // Determinar mês e ano alvo
    const now = new Date();
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth() + 1; // 1-indexed

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      targetYear = y;
      targetMonth = m;
    }

    // Dias no mês
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const daysAvailability: Array<{
      date: string;
      day: number;
      dayOfWeek: number;
      hasSlots: boolean;
      slotCount: number;
      slots: string[];
    }> = [];

    // Calcular horários disponíveis para cada dia do mês
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(targetMonth).padStart(2, '0');
      const dateISO = `${targetYear}-${monthStr}-${dayStr}`;

      const dateObj = new Date(targetYear, targetMonth - 1, day);
      const dayOfWeek = dateObj.getDay();

      const result = await buscarHorariosDisponiveis(dateISO, 'qualquer', clinic.id);
      const slots: string[] = result.success && result.data?.slots ? result.data.slots : [];

      daysAvailability.push({
        date: dateISO,
        day,
        dayOfWeek,
        hasSlots: slots.length > 0,
        slotCount: slots.length,
        slots,
      });
    }

    return NextResponse.json({
      success: true,
      clinic: {
        id: clinic.id,
        name: clinic.name,
        specialty: clinic.specialty,
        phone: clinic.phone,
      },
      doctor: {
        name: doctor.name,
      },
      year: targetYear,
      month: targetMonth,
      days: daysAvailability,
    });
  } catch (error: any) {
    console.error('Erro em GET /api/appointments/availability:', (error as Error).message);
    return NextResponse.json({ error: 'Não foi possível consultar os horários agora.' }, { status: 500 });
  }
}
