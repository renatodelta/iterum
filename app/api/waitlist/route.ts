import { NextRequest, NextResponse } from 'next/server';
import {
  loadWaitlist,
  addToWaitlist,
  removeFromWaitlist,
  updateWaitlistEntry,
  notifyFirstInWaitlistForVacatedSlot,
  confirmWaitlistBooking,
  declineWaitlistSlot,
  clearWaitlist,
} from '@/lib/waitlist';

export const dynamic = 'force-dynamic';

// GET /api/waitlist - Listar todos os pacientes na fila de espera
export async function GET() {
  try {
    const list = await loadWaitlist();
    return NextResponse.json({
      success: true,
      count: list.length,
      waitlist: list,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/waitlist - Inserir novo paciente na fila ou disparar teste de notificação
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Se for ação de teste ou disparo de vaga vaga liberada
    if (body.action === 'notify_vacated') {
      const { startTime, endTime } = body;
      if (!startTime) {
        return NextResponse.json({ error: 'startTime é obrigatório para notificar a vaga liberada.' }, { status: 400 });
      }
      const result = await notifyFirstInWaitlistForVacatedSlot({ startTime, endTime });
      return NextResponse.json({ success: true, ...result });
    }

    const { patientName, patientPhone, preferredShift, preferredDays, notes, patientId } = body;
    if (!patientName || !patientPhone) {
      return NextResponse.json({ error: 'Nome do paciente e telefone são obrigatórios.' }, { status: 400 });
    }

    const entry = await addToWaitlist({
      patientId,
      patientName,
      patientPhone,
      preferredShift,
      preferredDays,
      notes,
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/waitlist - Atualizar status, confirmar agendamento ou recusar
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID do item da fila é obrigatório.' }, { status: 400 });
    }

    if (action === 'confirm_booking') {
      const result = await confirmWaitlistBooking(id);
      return NextResponse.json(result);
    }

    if (action === 'decline_slot') {
      const result = await declineWaitlistSlot(id);
      return NextResponse.json(result);
    }

    const updated = await updateWaitlistEntry(id, {
      ...(status ? { status } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });

    return NextResponse.json({ success: true, entry: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/waitlist - Remover da fila ou zerar fila
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const all = searchParams.get('all');

    if (all === 'true' || id === 'all') {
      await clearWaitlist();
      return NextResponse.json({ success: true, message: 'Fila de espera zerada com sucesso.' });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório.' }, { status: 400 });
    }

    const removed = await removeFromWaitlist(id);
    return NextResponse.json({ success: removed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
