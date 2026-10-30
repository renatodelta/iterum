import { prisma } from '@/lib/prisma';
import { addMinutes, isAfter, isBefore } from 'date-fns';
import { notifyFirstInWaitlistForVacatedSlot } from '@/lib/waitlist';

export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Converte qualquer string de data (ex: "2026-09-25 13:00", "2026-09-25T13:00")
 * interpretando explicitamente no fuso de Brasília (UTC-3).
 */
export function parseBRT(dateStr: string): Date {
  let s = dateStr.trim().replace(' ', 'T');
  if (s.includes('/')) {
    const parts = s.split('T');
    const dateParts = parts[0].split('/');
    if (dateParts.length === 3) {
      let year = dateParts[2];
      if (year.length === 2) {
        year = `20${year}`;
      }
      s = `${year}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}` + (parts[1] ? `T${parts[1]}` : '');
    }
  }
  if (!s.includes('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
      s += ':00';
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
      s += '-03:00';
    }
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date(dateStr);
}

/**
 * Formata um objeto Date para o horário de Brasília (UTC-3 / America/Sao_Paulo)
 */
export function formatBRT(date: Date, includeDayOfWeek: boolean = true): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: includeDayOfWeek ? 'long' : undefined,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

export function formatBRTShort(date: Date): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date).replace(',', ' às');
}

/**
 * 1. BUSCAR CONSULTA ATUAL DO PACIENTE
 */
export async function buscarConsultaAtual(telefonePaciente: string, clinicId?: string): Promise<ToolResult> {
  try {
    // Normalizar telefone (remover caracteres não numéricos)
    const cleanPhone = telefonePaciente.replace(/\D/g, '');

    // Buscar paciente pelo telefone
    const patient = await prisma.patient.findFirst({
      where: {
        phone: {
          contains: cleanPhone.slice(-8), // busca pelos últimos dígitos para lidar com DDD/país
        },
        ...(clinicId ? { clinicId } : {}),
      },
    });

    if (!patient) {
      return {
        success: false,
        message: `Nenhum paciente cadastrado encontrado para o telefone ${telefonePaciente}.`,
      };
    }

    const now = new Date();

    // Buscar agendamento futuro mais próximo
    const appointment = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        startTime: {
          gte: now,
        },
        status: {
          in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'],
        },
      },
      orderBy: {
        startTime: 'asc',
      },
      include: {
        clinic: true,
        patient: true,
      },
    });

    if (!appointment) {
      return {
        success: true,
        message: `Olá ${patient.name}, você não possui nenhuma consulta futura agendada no momento.`,
        data: { patientName: patient.name, hasAppointment: false },
      };
    }

    const dataFormatada = formatBRT(new Date(appointment.startTime));

    return {
      success: true,
      message: `Consulta encontrada para ${patient.name}:\n- Data: ${dataFormatada}\n- Status: ${appointment.status}\n- Especialidade: ${appointment.clinic.specialty}\n- ID Agendamento: ${appointment.id}`,
      data: {
        appointmentId: appointment.id,
        patientName: patient.name,
        patientPhone: patient.phone,
        startTime: appointment.startTime.toISOString(),
        endTime: appointment.endTime.toISOString(),
        status: appointment.status,
        specialty: appointment.clinic.specialty,
        clinicName: appointment.clinic.name,
      },
    };
  } catch (error: any) {
    console.error('Erro em buscarConsultaAtual:', error);
    return {
      success: false,
      message: `Erro ao buscar consulta: ${error.message}`,
    };
  }
}

/**
 * 2. BUSCAR HORÁRIOS DISPONÍVEIS NA GRADE
 */
export async function buscarHorariosDisponiveis(
  dataDesejada: string, // YYYY-MM-DD
  periodo: 'manha' | 'tarde' | 'noite' | 'qualquer' = 'qualquer',
  clinicId?: string
): Promise<ToolResult> {
  try {
    // Obter primeira clínica se não fornecida
    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) {
      return { success: false, message: 'Clínica não encontrada no sistema.' };
    }

    // Data no fuso BRT
    const targetDateStart = parseBRT(dataDesejada.includes('T') ? dataDesejada : `${dataDesejada.trim()}T00:00:00`);
    if (isNaN(targetDateStart.getTime())) {
      return { success: false, message: 'Formato de data inválido. Use DD/MM/AA (ex: 25/09/26).' };
    }

    const year = targetDateStart.getFullYear();
    const month = String(targetDateStart.getMonth() + 1).padStart(2, '0');
    const day = String(targetDateStart.getDate()).padStart(2, '0');
    const cleanDateStr = `${year}-${month}-${day}`;

    // Obter dia da semana em BRT (0 = Domingo, 1 = Segunda... 6 = Sábado)
    const dayOfWeek = targetDateStart.getDay().toString();

    let workingHoursConfig: Record<string, { active: boolean; start: string; end: string; lunchStart: string; lunchEnd: string }>;

    try {
      workingHoursConfig = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
    } catch (e) {
      return { success: false, message: 'Erro na configuração do expediente da clínica.' };
    }

    // Verificar se a agenda está aberta e se a data está dentro do período configurado
    const metaAgenda = (workingHoursConfig as any)?.meta;
    const selectedDaysList: string[] = Array.isArray(metaAgenda?.selectedDays)
      ? metaAgenda.selectedDays
      : (Array.isArray((workingHoursConfig as any)?.selectedDays) ? (workingHoursConfig as any).selectedDays : []);

    if (!metaAgenda?.scheduleStartDate || !metaAgenda?.scheduleEndDate || selectedDaysList.length === 0) {
      return {
        success: true,
        message: 'A agenda ainda não foi aberta para atendimentos pelo profissional. Por favor, entre em contato mais tarde.',
        data: { slots: [] },
      };
    }

    if (cleanDateStr < metaAgenda.scheduleStartDate || cleanDateStr > metaAgenda.scheduleEndDate) {
      const [sy, sm, sd] = metaAgenda.scheduleStartDate.split('-');
      const [ey, em, ed] = metaAgenda.scheduleEndDate.split('-');
      return {
        success: true,
        message: `A agenda está aberta para atendimentos exclusivamente de ${sd}/${sm}/${sy} até ${ed}/${em}/${ey}. A data solicitada (${cleanDateStr}) está fora do período de atendimento configurado.`,
        data: { slots: [] },
      };
    }

    if (!selectedDaysList.includes(dayOfWeek)) {
      const diasNomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      return {
        success: true,
        message: `O profissional não atende aos ${diasNomes[parseInt(dayOfWeek)]}s. Por favor escolha outro dia da semana.`,
        data: { slots: [] },
      };
    }

    const dayConfig = workingHoursConfig[dayOfWeek];
    if (!dayConfig || !dayConfig.active) {
      const diasNomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      return {
        success: true,
        message: `O profissional não atende aos ${diasNomes[parseInt(dayOfWeek)]}s. Por favor escolha outro dia da semana.`,
        data: { slots: [] },
      };
    }

    // Gerar grade de horários considerando Retornos dinâmicos e intervalo de almoço
    const normDur = Number(metaAgenda?.slotDurationMinutes || clinic.slotDurationMinutes) || 45;
    const retDur = Number(metaAgenda?.returnSlotDurationMinutes) || 25;
    const returnSlotTimesList: string[] = Array.isArray(metaAgenda?.returnSlotTimes) ? metaAgenda.returnSlotTimes : [];
    const returnSet = new Set(returnSlotTimesList);
    const slots: string[] = [];

    const [startH, startM] = dayConfig.start.split(':').map(Number);
    const [endH, endM] = dayConfig.end.split(':').map(Number);

    const startTimeBRT = parseBRT(`${cleanDateStr}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`);
    const endTimeBRT = parseBRT(`${cleanDateStr}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);

    let lunchStartTime: Date | null = null;
    let lunchEndTime: Date | null = null;

    if (dayConfig.lunchStart && dayConfig.lunchEnd) {
      lunchStartTime = parseBRT(`${cleanDateStr}T${dayConfig.lunchStart}:00`);
      lunchEndTime = parseBRT(`${cleanDateStr}T${dayConfig.lunchEnd}:00`);
    }

    // Buscar agendamentos existentes no dia
    const startOfDay = parseBRT(`${cleanDateStr}T00:00:00`);
    const endOfDay = parseBRT(`${cleanDateStr}T23:59:59`);

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: clinic.id,
        startTime: { gte: startOfDay, lte: endOfDay },
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'] },
      },
    });

    const now = new Date();
    let currentTime = new Date(startTimeBRT);

    while (isBefore(currentTime, endTimeBRT)) {
      // Pular intervalo se dentro do almoço
      if (
        lunchStartTime &&
        lunchEndTime &&
        (isAfter(currentTime, lunchStartTime) || currentTime.getTime() === lunchStartTime.getTime()) &&
        isBefore(currentTime, lunchEndTime)
      ) {
        currentTime = new Date(lunchEndTime);
        continue;
      }

      const timeStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(currentTime);

      const isReturn = returnSet.has(timeStr);
      const currentDur = isReturn ? retDur : normDur;
      const slotEnd = addMinutes(currentTime, currentDur);

      // Se ultrapassar início do almoço
      if (lunchStartTime && isBefore(currentTime, lunchStartTime) && isAfter(slotEnd, lunchStartTime)) {
        if (lunchEndTime) {
          currentTime = new Date(lunchEndTime);
          continue;
        }
      }

      if (isAfter(slotEnd, endTimeBRT)) break;

      const isFutureSlot = isAfter(currentTime, now);

      // Verificar se não colide com agendamento existente
      const isOccupied = existingAppointments.some((appt) => {
        const apptStart = new Date(appt.startTime);
        const apptEnd = new Date(appt.endTime);
        return (
          (currentTime >= apptStart && currentTime < apptEnd) ||
          (slotEnd > apptStart && slotEnd <= apptEnd)
        );
      });

      if (isFutureSlot && !isOccupied) {
        const hourInt = parseInt(timeStr.split(':')[0], 10);

        let matchesPeriod = true;
        if (periodo === 'manha' && hourInt >= 12) matchesPeriod = false;
        if (periodo === 'tarde' && (hourInt < 12 || hourInt >= 18)) matchesPeriod = false;
        if (periodo === 'noite' && hourInt < 18) matchesPeriod = false;

        if (matchesPeriod) {
          slots.push(timeStr);
        }
      }

      currentTime = slotEnd;
    }

    const dataExtenso = formatBRT(targetDateStart, true);

    if (slots.length === 0) {
      return {
        success: true,
        message: `Não encontramos horários livres disponíveis para o dia ${dataExtenso}${periodo !== 'qualquer' ? ` no período da ${periodo}` : ''}.`,
        data: { date: dataDesejada, slots: [] },
      };
    }

    return {
      success: true,
      message: `Horários disponíveis em ${dataExtenso}:\n${slots.join(', ')}`,
      data: {
        date: dataDesejada,
        periodo,
        slots,
      },
    };
  } catch (error: any) {
    console.error('Erro em buscarHorariosDisponiveis:', error);
    return {
      success: false,
      message: `Erro ao buscar horários: ${error.message}`,
    };
  }
}

/**
 * 3. CANCELAR CONSULTA
 */
export async function cancelarConsulta(agendamentoId: string, motivo?: string): Promise<ToolResult> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: agendamentoId },
      include: { clinic: true, patient: true },
    });

    if (!appointment) {
      return { success: false, message: 'Agendamento não encontrado.' };
    }

    if (appointment.status === 'CANCELADO' || appointment.status === 'CANCELED') {
      return { success: true, message: 'Esta consulta já estava cancelada.' };
    }

    // Verificar antecedência mínima
    const now = new Date();
    const minCancelHours = appointment.clinic.minCancelHours || 2;
    const hoursDifference = (new Date(appointment.startTime).getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursDifference < minCancelHours && hoursDifference > 0) {
      return {
        success: false,
        message: `O cancelamento automático só pode ser feito com pelo menos ${minCancelHours} horas de antecedência. Entre em contato diretamente com a recepção da clínica.`,
      };
    }

    // Atualizar status para CANCELADO
    const updated = await prisma.appointment.update({
      where: { id: agendamentoId },
      data: {
        status: 'CANCELADO',
        notes: motivo ? `Cancelado via WhatsApp IA. Motivo: ${motivo}` : 'Cancelado via WhatsApp IA.',
      },
    });

    // Notificar automaticamente o 1º paciente da Fila de Espera sobre a vaga liberada
    try {
      await notifyFirstInWaitlistForVacatedSlot({
        startTime: appointment.startTime,
        endTime: appointment.endTime,
      });
    } catch (waitErr) {
      console.warn('⚠️ [Waitlist] Erro ao notificar fila no cancelamento:', waitErr);
    }

    const dataFormatada = formatBRTShort(new Date(appointment.startTime));

    return {
      success: true,
      message: `Consulta de ${appointment.patient.name} marcada para ${dataFormatada} foi CANCELADA com sucesso.`,
      data: {
        appointmentId: updated.id,
        status: updated.status,
        patientName: appointment.patient.name,
      },
    };
  } catch (error: any) {
    console.error('Erro em cancelarConsulta:', error);
    return {
      success: false,
      message: `Erro ao cancelar consulta: ${error.message}`,
    };
  }
}

/**
 * 4. CONFIRMAR REMARCAÇÃO DE CONSULTA
 */
export async function confirmarRemarcacao(
  agendamentoId: string,
  novaDataHora: string, // YYYY-MM-DD HH:mm ou ISO ou DD/MM/YYYY HH:mm
  patientPhone?: string
): Promise<ToolResult> {
  try {
    let oldAppointment = null;
    let patient = null;

    if (agendamentoId) {
      oldAppointment = await prisma.appointment.findUnique({
        where: { id: agendamentoId },
        include: { clinic: true, patient: true },
      });
    }

    if (oldAppointment) {
      patient = oldAppointment.patient;
    } else if (patientPhone) {
      const cleanPhone = patientPhone.replace(/\D/g, '');
      patient = await prisma.patient.findFirst({
        where: { phone: { contains: cleanPhone.slice(-8) } },
      });
    }

    if (!patient) {
      return { success: false, message: 'Agendamento original não encontrado.' };
    }

    const clinic = oldAppointment?.clinic || (await prisma.clinic.findFirst());
    if (!clinic) {
      return { success: false, message: 'Clínica não encontrada no sistema.' };
    }

    // Converter novaDataHora para Date no fuso BRT (UTC-3)
    const newStart = parseBRT(novaDataHora);

    if (isNaN(newStart.getTime())) {
      return {
        success: false,
        message: 'Formato da nova data/hora inválido. Forneça no formato YYYY-MM-DD HH:mm (ex: 2026-09-15 14:00).',
      };
    }

    const slotDuration = clinic.slotDurationMinutes || 30;
    const newEnd = addMinutes(newStart, slotDuration);

    // Verificar se novo horário colide com algum outro agendamento ativo de outro paciente
    const conflict = await prisma.appointment.findFirst({
      where: {
        clinicId: clinic.id,
        patientId: { not: patient.id },
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'] },
        OR: [
          {
            startTime: { lte: newStart },
            endTime: { gt: newStart },
          },
          {
            startTime: { lt: newEnd },
            endTime: { gte: newEnd },
          },
        ],
      },
    });

    if (conflict) {
      return {
        success: false,
        message: 'Desculpe, o novo horário escolhido acabou de ser ocupado. Por favor, consulte os horários livres novamente.',
      };
    }

    const dataFormatada = formatBRT(newStart, true);
    const dataShortFormatada = formatBRTShort(newStart);

    // 1. Atualizar TODOS os agendamentos anteriores do paciente ativos para REMARCADO
    await prisma.appointment.updateMany({
      where: {
        patientId: patient.id,
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'] },
      },
      data: {
        status: 'REMARCADO',
        notes: `Remarcado para ${dataShortFormatada}`,
      },
    });

    // 2. Criar novo agendamento com status AGENDADO
    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        startTime: newStart,
        endTime: newEnd,
        status: 'AGENDADO',
        notes: oldAppointment
          ? `Remarcado a partir do agendamento anterior #${oldAppointment.id.slice(0, 8)}`
          : 'Agendado via WhatsApp IA',
      },
    });

    // 3. Notificar automaticamente o 1º paciente da Fila de Espera para a lacuna aberta pela remarcação
    if (oldAppointment?.startTime) {
      try {
        await notifyFirstInWaitlistForVacatedSlot({
          startTime: oldAppointment.startTime,
          endTime: oldAppointment.endTime,
        });
      } catch (waitErr) {
        console.warn('⚠️ [Waitlist] Erro ao notificar fila na remarcação:', waitErr);
      }
    }

    return {
      success: true,
      message: `Consulta confirmada com sucesso! Nova consulta agendada para ${dataFormatada} com ${clinic.name}.`,
      data: {
        newAppointmentId: newAppointment.id,
        oldAppointmentId: oldAppointment?.id,
        patientName: patient.name,
        newStartTime: newStart.toISOString(),
        newEndTime: newEnd.toISOString(),
        status: 'AGENDADO',
      },
    };
  } catch (error: any) {
    console.error('Erro em confirmarRemarcacao:', error);
    return {
      success: false,
      message: `Erro ao confirmar remarcação: ${error.message}`,
    };
  }
}

/**
 * 5. BUSCAR PRÓXIMOS DIAS E HORÁRIOS DISPONÍVEIS NA GRADE
 */
export async function buscarProximosHorariosDisponiveis(
  clinicId?: string,
  diasDesejados: number = 2
): Promise<{
  success: boolean;
  message: string;
  data: {
    days: Array<{
      dateISO: string;
      formattedDate: string;
      slots: string[];
    }>;
    formattedText: string;
  };
}> {
  try {
    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) {
      return {
        success: false,
        message: 'Clínica não encontrada.',
        data: { days: [], formattedText: '' },
      };
    }

    const daysWithSlots: Array<{
      dateISO: string;
      formattedDate: string;
      slots: string[];
    }> = [];

    const now = new Date();
    const checkDate = new Date(now);

    for (let i = 0; i < 14; i++) {
      if (daysWithSlots.length >= diasDesejados) break;

      const year = checkDate.getFullYear();
      const month = String(checkDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkDate.getDate()).padStart(2, '0');
      const dateISO = `${year}-${month}-${day}`;

      const res = await buscarHorariosDisponiveis(dateISO, 'qualquer', clinic.id);
      if (res.success && res.data?.slots && res.data.slots.length > 0) {
        const formattedDate = checkDate.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
        });
        const capFormattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

        daysWithSlots.push({
          dateISO,
          formattedDate: capFormattedDate,
          slots: res.data.slots,
        });
      }

      checkDate.setDate(checkDate.getDate() + 1);
    }

    if (daysWithSlots.length === 0) {
      return {
        success: true,
        message: 'Não há horários disponíveis nos próximos dias.',
        data: { days: [], formattedText: 'No momento, não localizamos horários livres na agenda nos próximos dias.' },
      };
    }

    const lines: string[] = [];
    for (const d of daysWithSlots) {
      const displaySlots = d.slots.slice(0, 6).join(', ');
      const maisSlots = d.slots.length > 6 ? ` e mais ${d.slots.length - 6} horários` : '';
      lines.push(`📅 *${d.formattedDate}:*\n• ${displaySlots}${maisSlots}`);
    }

    return {
      success: true,
      message: 'Próximos horários localizados com sucesso.',
      data: {
        days: daysWithSlots,
        formattedText: lines.join('\n\n'),
      },
    };
  } catch (error: any) {
    console.error('Erro em buscarProximosHorariosDisponiveis:', error);
    return {
      success: false,
      message: `Erro: ${error.message}`,
      data: { days: [], formattedText: '' },
    };
  }
}

/**
 * 6. CRIAR NOVO AGENDAMENTO DE CONSULTA
 */
export async function criarNovoAgendamento(
  patientId: string,
  novaDataHora: string, // YYYY-MM-DD HH:mm
  clinicId?: string,
  beneficiarioNome?: string
): Promise<ToolResult> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      return { success: false, message: 'Paciente não encontrado para realizar o agendamento.' };
    }

    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) {
      return { success: false, message: 'Clínica não encontrada no sistema.' };
    }

    const newStart = parseBRT(novaDataHora);
    if (isNaN(newStart.getTime())) {
      return {
        success: false,
        message: 'Formato da data/hora inválido. Use AAAA-MM-DD HH:mm (ex: 2026-09-25 14:00).',
      };
    }

    const slotDuration = clinic.slotDurationMinutes || 30;
    const newEnd = addMinutes(newStart, slotDuration);

    // Verificar se o horário solicitado está dentro dos dias e período da agenda criada
    if (clinic.workingHours) {
      try {
        const whConfig = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        const meta = whConfig?.meta;
        const selectedDaysList: string[] = Array.isArray(meta?.selectedDays)
          ? meta.selectedDays
          : (Array.isArray(whConfig?.selectedDays) ? whConfig.selectedDays : []);
        const year = newStart.getFullYear();
        const month = String(newStart.getMonth() + 1).padStart(2, '0');
        const day = String(newStart.getDate()).padStart(2, '0');
        const dateISO = `${year}-${month}-${day}`;
        const dow = newStart.getDay().toString();

        if (!meta?.scheduleStartDate || !meta?.scheduleEndDate || selectedDaysList.length === 0) {
          return {
            success: false,
            message: 'A agenda do médico ainda não foi aberta para novas consultas.',
          };
        }
        if (dateISO < meta.scheduleStartDate || dateISO > meta.scheduleEndDate) {
          return {
            success: false,
            message: 'A data desejada está fora do período de abertura da agenda do profissional.',
          };
        }
        if (!selectedDaysList.includes(dow)) {
          return {
            success: false,
            message: 'O médico não atende neste dia da semana.',
          };
        }
      } catch (e) {
        // Ignora erro de parsing
      }
    }

    // Verificar colisão de horários
    const conflict = await prisma.appointment.findFirst({
      where: {
        clinicId: clinic.id,
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'] },
        OR: [
          {
            startTime: { lte: newStart },
            endTime: { gt: newStart },
          },
          {
            startTime: { lt: newEnd },
            endTime: { gte: newEnd },
          },
        ],
      },
    });

    if (conflict) {
      return {
        success: false,
        message: 'Desculpe, este horário acabou de ser ocupado. Por favor, escolha outro horário.',
      };
    }

    const notes =
      beneficiarioNome && beneficiarioNome.toLowerCase() !== patient.name.toLowerCase()
        ? `Agendamento para: ${beneficiarioNome} (Titular WhatsApp: ${patient.name})`
        : 'Agendado via WhatsApp Bot (1º Contato)';

    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        startTime: newStart,
        endTime: newEnd,
        status: 'AGENDADO',
        notes,
      },
    });

    const dataFormatada = formatBRT(newStart, true);
    return {
      success: true,
      message: `Agendamento confirmado para ${dataFormatada}!`,
      data: {
        appointmentId: newAppointment.id,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        patientName: beneficiarioNome || patient.name,
      },
    };
  } catch (error: any) {
    console.error('Erro em criarNovoAgendamento:', error);
    return {
      success: false,
      message: `Erro ao criar agendamento: ${error.message}`,
    };
  }
}

