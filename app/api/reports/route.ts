import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppMessage, formatForWhatsApp } from '@/lib/whatsapp/client';
import { formatBRT, formatBRTShort } from '@/lib/ai/tools';

export const dynamic = 'force-dynamic';

interface WorkingHourDay {
  active: boolean;
  start: string;
  end: string;
  lunchStart?: string;
  lunchEnd?: string;
}

/**
 * Calcula horários disponíveis teóricos com base nas configurações de expediente da clínica
 */
function calculateAvailableSlotsForDate(date: Date, workingHoursConfig: Record<string, WorkingHourDay>, slotDurationMinutes: number): number {
  const dayOfWeek = date.getDay().toString();
  const config = workingHoursConfig[dayOfWeek];
  if (!config || !config.active || !config.start || !config.end) return 0;

  const [startH, startM] = config.start.split(':').map(Number);
  const [endH, endM] = config.end.split(':').map(Number);
  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);

  if (config.lunchStart && config.lunchEnd) {
    const [lunchStartH, lunchStartM] = config.lunchStart.split(':').map(Number);
    const [lunchEndH, lunchEndM] = config.lunchEnd.split(':').map(Number);
    const lunchMinutes = (lunchEndH * 60 + lunchEndM) - (lunchStartH * 60 + lunchStartM);
    if (lunchMinutes > 0) totalMinutes -= lunchMinutes;
  }

  if (totalMinutes <= 0 || slotDurationMinutes <= 0) return 0;
  return Math.floor(totalMinutes / slotDurationMinutes);
}

/**
 * GET /api/reports
 * Retorna dados consolidados de inteligência, ROI da IA, ocupação da agenda e pacientes
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'month';
    const clinicId = searchParams.get('clinicId');
    const ticketMedioParam = searchParams.get('ticketMedio');
    const ticketMedio = ticketMedioParam ? Number(ticketMedioParam) : 350;

    // 1. Localizar clínica
    let clinic = clinicId ? await prisma.clinic.findUnique({ where: { id: clinicId } }) : await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Nenhum consultório localizado.' }, { status: 404 });
    }

    const doctorUser = await prisma.user.findFirst({
      where: { role: 'MEDICO', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    const doctorName = doctorUser?.name || clinic.doctorName || clinic.name;
    const doctorPhone = doctorUser?.phone || clinic.phone;

    // 2. Definir janela temporal
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let periodLabel = 'Este Mês';

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        periodLabel = 'Últimos 7 dias';
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        periodLabel = 'Últimos 30 dias';
        break;
      case 'prev_month': {
        const firstDayPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        startDate = firstDayPrevMonth;
        endDate = lastDayPrevMonth;
        periodLabel = 'Mês Anterior';
        break;
      }
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        periodLabel = 'Últimos 90 dias';
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        periodLabel = `Ano ${now.getFullYear()}`;
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        periodLabel = 'Este Mês';
        break;
    }

    // 3. Buscar agendamentos no período
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: clinic.id,
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            createdAt: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    // 4. Métricas de status de consultas
    let countAgendado = 0;
    let countConfirmado = 0;
    let countCancelado = 0;
    let countRemarcado = 0;
    let countRealizado = 0;

    for (const appt of appointments) {
      const st = (appt.status || '').toUpperCase();
      if (st === 'CONFIRMADO' || st === 'CONFIRMED') countConfirmado++;
      else if (st === 'CANCELADO' || st === 'CANCELED') countCancelado++;
      else if (st === 'REMARCADO' || st === 'RESCHEDULED') countRemarcado++;
      else if (st === 'REALIZADO' || st === 'COMPLETED') countRealizado++;
      else countAgendado++;
    }

    const totalConsultas = appointments.length;
    const consultasAtivas = countAgendado + countConfirmado + countRealizado;
    const taxaConfirmacao = consultasAtivas > 0 ? Math.round(((countConfirmado + countRealizado) / consultasAtivas) * 100) : 0;
    const taxaCancelamento = totalConsultas > 0 ? Math.round((countCancelado / totalConsultas) * 100) : 0;

    // 5. ROI da Sofia (Agendamentos criados pela IA fora de horário comercial e Fila de Espera)
    let agendadosForaHorario = 0;
    let agendadosFilaEspera = 0;
    let agendadosPelaIA = 0;

    for (const appt of appointments) {
      const notes = (appt.notes || '').toLowerCase();
      const isIA = notes.includes('whatsapp') || notes.includes('bot') || notes.includes('sofia');
      if (isIA) agendadosPelaIA++;

      if (notes.includes('fila') || notes.includes('espera')) {
        agendadosFilaEspera++;
      }

      // Analisa o momento em que a consulta foi cadastrada no sistema
      const createdAt = new Date(appt.createdAt);
      const day = createdAt.getDay(); // 0 = Domingo, 6 = Sábado
      const hour = createdAt.getHours();
      const isWeekend = day === 0 || day === 6;
      const isOutsideBusinessHours = hour < 8 || hour >= 18;

      if (isWeekend || isOutsideBusinessHours) {
        agendadosForaHorario++;
      }
    }

    // Se houve registros na fila de espera com status AGENDADO no período
    const waitlistConverted = await prisma.waitlist.count({
      where: {
        clinicId: clinic.id,
        status: 'AGENDADO',
        updatedAt: { gte: startDate, lte: endDate },
      },
    });

    const totalVagasResgatadasFila = Math.max(agendadosFilaEspera, waitlistConverted);
    const totalConsultasProtegidasIA = agendadosForaHorario + totalVagasResgatadasFila;
    const faturamentoTotalProtegido = totalConsultasProtegidasIA * ticketMedio;
    const faturamentoEstimadoGeral = consultasAtivas * ticketMedio;

    // Horas de recepção economizadas (cada agendamento manual consome cerca de 8 a 10 min de telefone/WhatsApp)
    const minutosEconomizadosRecepcao = agendadosPelaIA * 9;
    const horasEconomizadasRecepcao = Math.round((minutosEconomizadosRecepcao / 60) * 10) / 10;

    // 6. Ocupação da Agenda e Ociosidade por Dia da Semana
    let workingHoursConfig: Record<string, WorkingHourDay> = {};
    try {
      workingHoursConfig = JSON.parse(clinic.workingHours || '{}');
    } catch (e) {}

    const slotDuration = clinic.slotDurationMinutes || 30;

    // Calcular dias da semana disponíveis e distribuição real
    const dayStats = [
      { dayIndex: 1, name: 'Segunda-feira', short: 'Seg', scheduled: 0, capacity: 0 },
      { dayIndex: 2, name: 'Terça-feira', short: 'Ter', scheduled: 0, capacity: 0 },
      { dayIndex: 3, name: 'Quarta-feira', short: 'Qua', scheduled: 0, capacity: 0 },
      { dayIndex: 4, name: 'Quinta-feira', short: 'Qui', scheduled: 0, capacity: 0 },
      { dayIndex: 5, name: 'Sexta-feira', short: 'Sex', scheduled: 0, capacity: 0 },
      { dayIndex: 6, name: 'Sábado', short: 'Sáb', scheduled: 0, capacity: 0 },
      { dayIndex: 0, name: 'Domingo', short: 'Dom', scheduled: 0, capacity: 0 },
    ];

    let countManha = 0;
    let countTarde = 0;

    for (const appt of appointments) {
      if (appt.status === 'CANCELADO' || appt.status === 'CANCELED') continue;
      const apptDate = new Date(appt.startTime);
      const dIndex = apptDate.getDay();
      const targetDay = dayStats.find((d) => d.dayIndex === dIndex);
      if (targetDay) targetDay.scheduled++;

      const hour = apptDate.getHours();
      if (hour < 12) countManha++;
      else countTarde++;
    }

    // Calcular capacidade teórica iterando pelos dias do período
    let totalCapacidadePeriodo = 0;
    const tempCursor = new Date(startDate);
    while (tempCursor <= endDate) {
      const dIndex = tempCursor.getDay();
      const slotsDia = calculateAvailableSlotsForDate(tempCursor, workingHoursConfig, slotDuration);
      totalCapacidadePeriodo += slotsDia;
      const targetDay = dayStats.find((d) => d.dayIndex === dIndex);
      if (targetDay) targetDay.capacity += slotsDia;
      tempCursor.setDate(tempCursor.getDate() + 1);
    }

    const taxaOcupacaoGeral = totalCapacidadePeriodo > 0
      ? Math.min(100, Math.round((consultasAtivas / totalCapacidadePeriodo) * 100))
      : 85;

    // Mapear dias calculando taxa de ocupação individual
    const diasAnalise = dayStats
      .filter((d) => d.capacity > 0 || d.scheduled > 0)
      .map((d) => {
        const taxa = d.capacity > 0 ? Math.min(100, Math.round((d.scheduled / d.capacity) * 100)) : 0;
        return {
          ...d,
          taxaOcupacao: taxa,
          ociosidade: Math.max(0, 100 - taxa),
        };
      });

    // 7. Retenção de Pacientes e Radar de Pacientes Inativos
    const uniquePatientIds = Array.from(new Set(appointments.map((a) => a.patientId)));
    let pacientesNovosCount = 0;
    let pacientesRecorrentesCount = 0;

    for (const pId of uniquePatientIds) {
      const anterior = await prisma.appointment.findFirst({
        where: {
          clinicId: clinic.id,
          patientId: pId,
          startTime: { lt: startDate },
        },
      });
      if (anterior) pacientesRecorrentesCount++;
      else pacientesNovosCount++;
    }

    // Pacientes inativos (cuja última consulta foi há mais de 180 dias / 6 meses)
    const seisMesesAtras = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const todosPacientes = await prisma.patient.findMany({
      where: { clinicId: clinic.id },
      include: {
        appointments: {
          orderBy: { startTime: 'desc' },
          take: 1,
        },
      },
    });

    const pacientesInativos = todosPacientes
      .filter((p) => {
        if (p.appointments.length === 0) return false;
        const ultima = new Date(p.appointments[0].startTime);
        return ultima < seisMesesAtras;
      })
      .map((p) => {
        const ultimaData = new Date(p.appointments[0].startTime);
        const diffDias = Math.floor((now.getTime() - ultimaData.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: p.id,
          name: p.name,
          phone: p.phone,
          ultimaConsulta: formatBRTShort(ultimaData),
          diasSemConsulta: diffDias,
        };
      })
      .sort((a, b) => b.diasSemConsulta - a.diasSemConsulta);

    // 8. Eficiência Operacional do WhatsApp
    const totalMensagens = await prisma.message.count({
      where: {
        clinicId: clinic.id,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const pacientesEmTransbordo = await prisma.patient.count({
      where: {
        clinicId: clinic.id,
        humanHandoff: true,
      },
    });

    const totalConversas = Math.max(uniquePatientIds.length, 1);
    const conversasAutonomas = Math.max(0, totalConversas - pacientesEmTransbordo);
    const taxaAutonomiaIA = Math.min(100, Math.round((conversasAutonomas / totalConversas) * 100));

    return NextResponse.json({
      success: true,
      period,
      periodLabel,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      doctor: {
        name: doctorName,
        phone: doctorPhone,
        specialty: doctorUser?.specialty || clinic.specialty,
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
      },
      kpis: {
        totalConsultas,
        consultasAtivas,
        confirmadas: countConfirmado,
        realizadas: countRealizado,
        canceladas: countCancelado,
        remarcadas: countRemarcado,
        taxaConfirmacao,
        taxaCancelamento,
        taxaOcupacaoGeral,
      },
      roi: {
        ticketMedio,
        faturamentoEstimadoGeral,
        agendadosForaHorario,
        totalVagasResgatadasFila,
        totalConsultasProtegidasIA,
        faturamentoTotalProtegido,
        agendadosPelaIA,
        horasEconomizadasRecepcao,
      },
      agendaOcupacao: {
        dias: diasAnalise,
        turnoManha: countManha,
        turnoTarde: countTarde,
      },
      retencao: {
        pacientesAtendidos: uniquePatientIds.length,
        pacientesNovos: pacientesNovosCount,
        pacientesRecorrentes: pacientesRecorrentesCount,
        totalInativos: pacientesInativos.length,
        listaInativos: pacientesInativos.slice(0, 8),
      },
      whatsapp: {
        totalMensagens,
        taxaAutonomiaIA,
        pacientesEmTransbordo,
      },
    });
  } catch (error: any) {
    console.error('❌ Erro ao gerar relatório de inteligência:', error);
    return NextResponse.json({ error: error.message || 'Erro interno ao processar relatórios' }, { status: 500 });
  }
}

/**
 * POST /api/reports
 * Envia o resumo executivo mensal formatado diretamente para o WhatsApp do médico titular
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clinicId, phoneTo, periodLabel = 'deste mês', customTicketMedio = 350 } = body;

    let clinic = clinicId ? await prisma.clinic.findUnique({ where: { id: clinicId } }) : await prisma.clinic.findFirst();
    if (!clinic) {
      return NextResponse.json({ error: 'Consultório não localizado.' }, { status: 404 });
    }

    const doctorUser = await prisma.user.findFirst({
      where: { role: 'MEDICO', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    const doctorName = doctorUser?.name || clinic.doctorName || clinic.name;
    const targetPhone = phoneTo || doctorUser?.phone || clinic.phone;

    if (!targetPhone) {
      return NextResponse.json({ error: 'Nenhum número de WhatsApp informado para envio.' }, { status: 400 });
    }

    // Buscar dados rápidos do mês atual
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: clinic.id,
        startTime: { gte: startOfMonth },
        status: { notIn: ['CANCELADO', 'CANCELED'] },
      },
    });

    let foraHorario = 0;
    for (const a of appointments) {
      const cDate = new Date(a.createdAt);
      const d = cDate.getDay();
      const h = cDate.getHours();
      if (d === 0 || d === 6 || h < 8 || h >= 18) foraHorario++;
    }

    const vagasFila = await prisma.waitlist.count({
      where: { clinicId: clinic.id, status: 'AGENDADO', updatedAt: { gte: startOfMonth } },
    });

    const totalAtivas = appointments.length;
    const receitaProtegida = (foraHorario + vagasFila) * customTicketMedio;
    const receitaTotal = totalAtivas * customTicketMedio;

    const summaryText = `*Fechamento Executivo do Consultório* 🩺\n` +
      `Olá, *${doctorName}*! Aqui está o resumo consolidado de desempenho da sua agenda médica (${periodLabel}):\n\n` +
      `📊 *Desempenho da Agenda:*\n` +
      `• *Total de consultas ativas:* ${totalAtivas}\n` +
      `• *Faturamento estimado:* R$ ${receitaTotal.toLocaleString('pt-BR')},00\n\n` +
      `🤖 *Impacto da Sofia (Inteligência Artificial):*\n` +
      `• *Agendamentos fora do expediente:* ${foraHorario} consultas (noites e finais de semana)\n` +
      `• *Vagas resgatadas pela Fila de Espera:* ${vagasFila} horários salvos\n` +
      `• *Receita protegida pela IA:* R$ ${receitaProtegida.toLocaleString('pt-BR')},00\n\n` +
      `Sua secretária virtual cuidou de todos os agendamentos e lembretes com excelência. Tenha um excelente trabalho! ✨`;

    const formattedMessage = formatForWhatsApp(summaryText);
    const sendResult = await sendWhatsAppMessage(targetPhone, formattedMessage);

    if (!sendResult.success) {
      return NextResponse.json({
        success: false,
        error: sendResult.error || 'Falha ao despachar mensagem pelo WhatsApp.',
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: `Resumo executivo enviado com sucesso para ${targetPhone}!`,
    });
  } catch (error: any) {
    console.error('❌ Erro ao enviar resumo pelo WhatsApp:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
