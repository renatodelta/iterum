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
import { getSession, requireAuth } from '@/lib/apiAuth';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// GET /api/waitlist - Listar todos os pacientes na fila de espera
export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

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
    const session = await getSession(req);

    // Visitante (página pública de agendamento) só pode se inscrever na fila; não pode disparar notificações
    if (!session) {
      if (body.action) {
        return NextResponse.json({ error: 'Não autenticado. Faça login para continuar.' }, { status: 401 });
      }
      if (!rateLimit(`waitlist-public:${getClientIp(req)}`, 5, 60 * 60 * 1000)) {
        return NextResponse.json(
          { error: 'Muitas solicitações. Tente novamente mais tarde ou ligue para a clínica.' },
          { status: 429 }
        );
      }
    }

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

    // Visitante: limita o tamanho dos textos e ignora o vínculo com paciente existente (patientId)
    if (!session) {
      const tooLong = [patientName, patientPhone, preferredShift, preferredDays, notes].some(
        (v) => typeof v === 'string' && v.length > 200
      );
      if (typeof patientName !== 'string' || typeof patientPhone !== 'string' || tooLong) {
        return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
      }
    }

    const entry = await addToWaitlist({
      patientId: session ? patientId : undefined,
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
  const denied = await requireAuth(req);
  if (denied) return denied;

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
  const denied = await requireAuth(req);
  if (denied) return denied;

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
