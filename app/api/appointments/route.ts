import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseISO, addMinutes } from 'date-fns';
import { parseBRT } from '@/lib/ai/tools';
import { notifyFirstInWaitlistForVacatedSlot } from '@/lib/waitlist';

export const dynamic = 'force-dynamic';

// GET /api/appointments - Listagem de agendamentos com filtros por data e status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date');
    const status = searchParams.get('status');
    const patientId = searchParams.get('patientId');

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica cadastrada.' }, { status: 404 });
    }

    const whereClause: any = {
      clinicId: clinic.id,
    };

    if (status && status !== 'ALL') {
      const upper = status.toUpperCase();
      if (upper === 'AGENDADO' || upper === 'SCHEDULED') {
        whereClause.status = { in: ['AGENDADO', 'SCHEDULED'] };
      } else if (upper === 'CONFIRMADO' || upper === 'CONFIRMED') {
        whereClause.status = { in: ['CONFIRMADO', 'CONFIRMED'] };
      } else if (upper === 'REMARCADO' || upper === 'RESCHEDULED') {
        whereClause.status = { in: ['REMARCADO', 'RESCHEDULED'] };
      } else if (upper === 'CANCELADO' || upper === 'CANCELED') {
        whereClause.status = { in: ['CANCELADO', 'CANCELED'] };
      } else {
        whereClause.status = status;
      }
    }

    if (patientId) {
      whereClause.patientId = patientId;
    }

    if (dateStr) {
      const targetDate = parseISO(dateStr);
      if (!isNaN(targetDate.getTime())) {
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        whereClause.startTime = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: true,
        clinic: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      count: appointments.length,
      appointments,
    });
  } catch (error: any) {
    console.error('Erro em GET /api/appointments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/appointments - Criação manual de agendamento
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patientId, patientName, patientPhone, startTime, notes, status } = body;

    if ((!patientId && !patientPhone) || !startTime) {
      return NextResponse.json(
        { error: 'É necessário selecionar um paciente cadastrado e a data/hora.' },
        { status: 400 }
      );
    }

    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Nenhuma clínica cadastrada.' }, { status: 404 });
    }

    const formattedPhone = patientPhone ? (patientPhone.startsWith('+') ? patientPhone : `+55${patientPhone.replace(/\D/g, '')}`) : '';

    // Buscar paciente obrigatoriamente cadastrado
    let patient = null;

    if (patientId) {
      patient = await prisma.patient.findUnique({
        where: { id: patientId },
      });
    }

    if (!patient && formattedPhone) {
      patient = await prisma.patient.findFirst({
        where: {
          clinicId: clinic.id,
          phone: { contains: formattedPhone.slice(-8) },
        },
      });
    }

    // Se o paciente não estiver cadastrado, Bloquear e Exigir Cadastro Prévio
    if (!patient) {
      return NextResponse.json(
        { error: 'Paciente não cadastrado. É necessário realizar o cadastro do paciente na aba "Cadastro de Pacientes" antes de marcar a consulta.' },
        { status: 400 }
      );
    }

    const start = parseBRT(startTime);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Formato de startTime inválido.' }, { status: 400 });
    }

    const end = addMinutes(start, clinic.slotDurationMinutes || 30);

    // Verificar colisão
    const conflict = await prisma.appointment.findFirst({
      where: {
        clinicId: clinic.id,
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'] },
        OR: [
          { startTime: { lte: start }, endTime: { gt: start } },
          { startTime: { lt: end }, endTime: { gte: end } },
        ],
      },
    });

    if (conflict) {
      return NextResponse.json(
        { error: 'Já existe um agendamento para este mesmo horário.' },
        { status: 409 }
      );
    }

    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        startTime: start,
        endTime: end,
        status: status || 'AGENDADO',
        notes: notes || 'Agendamento manual criado pelo painel',
      },
      include: {
        patient: true,
      },
    });

    return NextResponse.json({
      success: true,
      appointment: newAppointment,
    });
  } catch (error: any) {
    console.error('Erro em POST /api/appointments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/appointments - Atualizar status, remarcar ou cancelar agendamento (com disparo automático para a Fila de Espera)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { appointmentId, action, status, newStartTime, notes } = body;

    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId é obrigatório.' }, { status: 400 });
    }

    const currentAppt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true, clinic: true },
    });

    if (!currentAppt) {
      return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
    }

    const clinic = currentAppt.clinic;
    const oldStart = currentAppt.startTime;
    const oldEnd = currentAppt.endTime;

    let waitlistNotificationResult: any = null;

    // Caso 1: REMARCAÇÃO (Manual pela agenda)
    if (action === 'REMARCAR' || newStartTime) {
      if (!newStartTime) {
        return NextResponse.json({ error: 'newStartTime é obrigatório para remarcar.' }, { status: 400 });
      }

      const newStart = parseBRT(newStartTime);
      const newEnd = addMinutes(newStart, clinic.slotDurationMinutes || 30);

      // Atualiza o agendamento atual com o novo horário
      const updatedAppt = await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          startTime: newStart,
          endTime: newEnd,
          status: 'CONFIRMADO',
          notes: notes ? `${notes} (Remarcado)` : `Remarcado manualmente pelo painel da agenda`,
        },
        include: { patient: true },
      });

      // Como o horário anterior (oldStart) ficou livre, notifica automaticamente o 1º da fila de espera!
      try {
        waitlistNotificationResult = await notifyFirstInWaitlistForVacatedSlot({
          startTime: oldStart,
          endTime: oldEnd,
        });
      } catch (wErr) {
        console.warn('⚠️ [Fila de Espera] Falha ao notificar fila na remarcação:', wErr);
      }

      return NextResponse.json({
        success: true,
        action: 'REMARCADO',
        appointment: updatedAppt,
        vacatedSlot: {
          startTime: oldStart,
          endTime: oldEnd,
        },
        waitlistNotification: waitlistNotificationResult,
      });
    }

    // Caso 2: CANCELAMENTO (Manual pela agenda)
    if (action === 'CANCELAR' || status === 'CANCELADO' || status === 'CANCELED') {
      const updatedAppt = await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CANCELADO',
          notes: notes || 'Cancelado manualmente pelo painel da agenda',
        },
        include: { patient: true },
      });

      // Horário antigo ficou vago! Notificar o 1º da fila de espera
      try {
        waitlistNotificationResult = await notifyFirstInWaitlistForVacatedSlot({
          startTime: oldStart,
          endTime: oldEnd,
        });
      } catch (wErr) {
        console.warn('⚠️ [Fila de Espera] Falha ao notificar fila no cancelamento:', wErr);
      }

      return NextResponse.json({
        success: true,
        action: 'CANCELADO',
        appointment: updatedAppt,
        vacatedSlot: {
          startTime: oldStart,
          endTime: oldEnd,
        },
        waitlistNotification: waitlistNotificationResult,
      });
    }

    // Caso 3: Atualização de status genérica (CONFIRMADO, AGENDADO, etc.)
    const updatedAppt = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: status || currentAppt.status,
        notes: notes !== undefined ? notes : currentAppt.notes,
      },
      include: { patient: true },
    });

    return NextResponse.json({
      success: true,
      appointment: updatedAppt,
    });
  } catch (error: any) {
    console.error('Erro em PATCH /api/appointments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
