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

    // Verificar se o horário está dentro do período e dias da agenda criada
    if (clinic.workingHours) {
      try {
        const whConfig = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        const meta = whConfig?.meta;
        const selectedDaysList: string[] = Array.isArray(meta?.selectedDays)
          ? meta.selectedDays
          : (Array.isArray(whConfig?.selectedDays) ? whConfig.selectedDays : []);
        const y = start.getFullYear();
        const m = String(start.getMonth() + 1).padStart(2, '0');
        const d = String(start.getDate()).padStart(2, '0');
        const dateISO = `${y}-${m}-${d}`;
        const dow = start.getDay().toString();

        if (meta?.scheduleStartDate && meta?.scheduleEndDate) {
          if (dateISO < meta.scheduleStartDate || dateISO > meta.scheduleEndDate) {
            return NextResponse.json(
              { error: `Data fora do período de abertura da agenda (${meta.scheduleStartDate} a ${meta.scheduleEndDate}).` },
              { status: 400 }
            );
          }
        }
        if (selectedDaysList.length > 0 && !selectedDaysList.includes(dow)) {
          return NextResponse.json(
            { error: 'Não há atendimento médico no dia da semana selecionado.' },
            { status: 400 }
          );
        }
      } catch (e) {
        // Ignora erro de parsing
      }
    }

    // Determinar duração da consulta considerando se é Retorno ou 1ª Vez
    let durationMinutes = Number(body.durationMinutes) || 0;
    if (!durationMinutes) {
      try {
        const workingHoursConfig = typeof clinic.workingHours === 'string'
          ? JSON.parse(clinic.workingHours)
          : clinic.workingHours;
        const meta = workingHoursConfig?.meta || {};
        const normDur = Number(meta.slotDurationMinutes || clinic.slotDurationMinutes) || 45;
        const retDur = Number(meta.returnSlotDurationMinutes || 25);
        const returnSlotTimesList: string[] = Array.isArray(meta.returnSlotTimes)
          ? meta.returnSlotTimes
          : [];

        const apptHour = String(start.getHours()).padStart(2, '0');
        const apptMin = String(start.getMinutes()).padStart(2, '0');
        const apptTimeStr = `${apptHour}:${apptMin}`;

        const isReturn =
          Boolean(body.isReturn) ||
          returnSlotTimesList.includes(apptTimeStr) ||
          (notes && notes.toLowerCase().includes('retorno'));

        durationMinutes = isReturn ? retDur : normDur;
      } catch (e) {
        durationMinutes = clinic.slotDurationMinutes || 45;
      }
    }

    const end = addMinutes(start, durationMinutes);

    // Verificar colisão de horários
    const conflict = await prisma.appointment.findFirst({
      where: {
        clinicId: clinic.id,
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED', 'ENCAIXE'] },
        OR: [
          { startTime: { lte: start }, endTime: { gt: start } },
          { startTime: { lt: end }, endTime: { gte: end } },
        ],
      },
      include: {
        patient: true,
      },
    });

    const isEncaixeRequested = Boolean(body.isEncaixe || body.status === 'ENCAIXE');

    if (conflict && !isEncaixeRequested) {
      return NextResponse.json(
        {
          error: `Já existe uma consulta marcada neste horário para ${conflict.patient?.name || 'outro paciente'}. Confirme para agendar como ENCAIXE.`,
          isConflict: true,
          conflictingPatient: conflict.patient?.name || 'Paciente',
        },
        { status: 409 }
      );
    }

    const finalStatus = (conflict || isEncaixeRequested) ? 'ENCAIXE' : (status || 'AGENDADO');
    let finalNotes = notes || 'Agendamento manual criado pelo painel';
    if ((conflict || isEncaixeRequested) && !finalNotes.toUpperCase().includes('ENCAIXE')) {
      finalNotes = conflict?.patient?.name
        ? `[ENCAIXE] ${finalNotes} (Sobreposto ao agendamento de ${conflict.patient.name})`
        : `[ENCAIXE] ${finalNotes}`;
    }

    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        startTime: start,
        endTime: end,
        status: finalStatus,
        notes: finalNotes,
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
