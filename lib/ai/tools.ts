import { prisma } from '@/lib/prisma';
import { addMinutes, isAfter, isBefore } from 'date-fns';
import { notifyFirstInWaitlistForVacatedSlot, addToWaitlist, updateWaitlistEntry } from '@/lib/waitlist';

export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Converte qualquer string de data (ex: "13/11", "13/11/2026", "2026-11-13", "13 de novembro", "13/11 14:15")
 * interpretando explicitamente no fuso de Brasília (UTC-3).
 */
export function parseBRT(dateInput: string): Date {
  if (!dateInput || typeof dateInput !== 'string') return new Date();
  let str = dateInput.trim();

  let timePart = '';
  if (str.includes('T')) {
    const split = str.split('T');
    str = split[0].trim();
    timePart = split[1]?.trim() || '';
  } else if (str.includes(' ')) {
    const split = str.split(' ');
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(split[1])) {
      str = split[0].trim();
      timePart = split[1].trim();
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  let year = currentYear;
  let month = -1;
  let day = -1;

  const mesesMap: Record<string, number> = {
    janeiro: 1, jan: 1,
    fevereiro: 2, fev: 2,
    marco: 3, mar: 3, março: 3,
    abril: 4, abr: 4,
    maio: 5, mai: 5,
    junho: 6, jun: 6,
    julho: 7, jul: 7,
    agosto: 8, ago: 8,
    setembro: 9, set: 9,
    outubro: 10, out: 10,
    novembro: 11, nov: 11,
    dezembro: 12, dez: 12,
  };

  const nomeMesMatch = str.toLowerCase().match(/(\d{1,2})\s*(?:de)?\s*([a-zçãé]+)(?:\s*(?:de)?\s*(\d{2,4}))?/i);
  if (nomeMesMatch && mesesMap[nomeMesMatch[2]]) {
    day = parseInt(nomeMesMatch[1], 10);
    month = mesesMap[nomeMesMatch[2]];
    if (nomeMesMatch[3]) {
      year = parseInt(nomeMesMatch[3].length === 2 ? `20${nomeMesMatch[3]}` : nomeMesMatch[3], 10);
    }
  }

  if (month === -1) {
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2], 10);
      } else if (parts.length === 2) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = currentYear;
      }
    } else if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        } else {
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2], 10);
        }
      } else if (parts.length === 2) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = currentYear;
      }
    }
  }

  if (day > 0 && month > 0 && year > 0) {
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    let tStr = timePart || '00:00:00';
    if (tStr.length === 5) tStr += ':00';
    const isoString = `${year}-${mStr}-${dStr}T${tStr}-03:00`;
    const dt = new Date(isoString);
    if (!isNaN(dt.getTime())) return dt;
  }

  const fallback = new Date(dateInput);
  return !isNaN(fallback.getTime()) ? fallback : new Date();
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
 * Localiza o paciente titular correspondente a um número de telefone com proteção estrita contra colisão de dependentes (que possuem sufixo '-2', '-3', etc.).
 */
export async function findPatientByPhone(telefone: string, clinicId?: string) {
  const cleanPhone = telefone.replace(/\D/g, '');
  const last8 = cleanPhone.slice(-8);

  // 1. Busca pelo telefone exato do titular
  let patient = await prisma.patient.findFirst({
    where: {
      ...(clinicId ? { clinicId } : {}),
      phone: {
        in: [
          `+${cleanPhone}`,
          cleanPhone,
          `+55${cleanPhone}`,
          cleanPhone.replace(/^55/, ''),
        ],
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // 2. Se não achou exato, busca pelos últimos 8 dígitos EXCLUINDO dependentes (que contêm hífen '-')
  if (!patient) {
    patient = await prisma.patient.findFirst({
      where: {
        ...(clinicId ? { clinicId } : {}),
        phone: { contains: last8 },
        NOT: { phone: { contains: '-' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 3. Fallback genérico ordenando pelo mais antigo (titular)
  if (!patient) {
    patient = await prisma.patient.findFirst({
      where: {
        ...(clinicId ? { clinicId } : {}),
        phone: { contains: last8 },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  return patient;
}

/**
 * 1. BUSCAR CONSULTA ATUAL DO PACIENTE
 */
export async function buscarConsultaAtual(
  telefonePaciente: string,
  clinicId?: string,
  nomePaciente?: string,
  cpfPaciente?: string
): Promise<ToolResult> {
  try {
    const now = new Date();
    let targetPatients: { id: string; name: string; phone: string; cpf?: string | null }[] = [];

    // 1. Se foi informado nomePaciente ou cpfPaciente (busca para terceiros/dependentes/outros pacientes)
    if (nomePaciente || cpfPaciente) {
      const cleanNome = (nomePaciente || '').trim();
      const cleanCpf = (cpfPaciente || '').replace(/\D/g, '');

      const found = await prisma.patient.findMany({
        where: {
          ...(clinicId ? { clinicId } : {}),
          OR: [
            ...(cleanCpf ? [
              { cpf: cleanCpf },
              { cpf: { contains: cleanCpf } },
            ] : []),
            ...(cleanNome ? [
              { name: { equals: cleanNome, mode: 'insensitive' as const } },
              { name: { contains: cleanNome, mode: 'insensitive' as const } },
            ] : []),
          ],
        },
      });

      if (found.length > 0) {
        targetPatients = found;
      } else {
        return {
          success: false,
          message: `Nenhum cadastro de paciente encontrado com o nome "${nomePaciente || ''}"${cpfPaciente ? ` ou CPF ${cpfPaciente}` : ''}. Por favor, confirme o nome completo ou CPF para localizarmos.`,
        };
      }
    } else {
      // 2. Busca padrão pelo telefone do interlocutor (titular e seus dependentes vinculados)
      const patient = await findPatientByPhone(telefonePaciente, clinicId);

      if (!patient) {
        return {
          success: false,
          message: `Nenhum paciente cadastrado encontrado para o telefone ${telefonePaciente}.`,
        };
      }

      const cleanPhone = telefonePaciente.replace(/\D/g, '');
      const last8 = cleanPhone.slice(-8);

      const relatedPatients = await prisma.patient.findMany({
        where: {
          ...(clinicId ? { clinicId } : {}),
          phone: { contains: last8 },
        },
        select: { id: true, name: true, phone: true, cpf: true },
      });

      targetPatients = relatedPatients.length > 0 ? relatedPatients : [patient];
    }

    const patientIds = targetPatients.map((p) => p.id);

    // Buscar todos os agendamentos futuros para os pacientes localizados
    const appointments = await prisma.appointment.findMany({
      where: {
        patientId: { in: patientIds },
        startTime: { gte: now },
        status: { in: ['AGENDADO', 'CONFIRMADO', 'SCHEDULED', 'CONFIRMED'] },
      },
      orderBy: { startTime: 'asc' },
      include: {
        clinic: true,
        patient: true,
      },
    });

    if (appointments.length === 0) {
      const pNames = targetPatients.map((p) => p.name).join(', ');
      return {
        success: true,
        message: `Não foi encontrada nenhuma consulta futura agendada para ${pNames}.`,
        data: { patientName: pNames, hasAppointment: false },
      };
    }

    // Se houver múltiplas consultas futuras (como na área de testes ou acompanhamentos frequentes)
    if (appointments.length > 1) {
      const itemsList = appointments
        .map((a, idx) => {
          const dt = formatBRT(new Date(a.startTime));
          return `${idx + 1}. Paciente: ${a.patient.name} | Data: ${dt} | Status: ${a.status} | ID: ${a.id}`;
        })
        .join('\n');

      return {
        success: true,
        message: `Foram encontradas ${appointments.length} consultas futuras para ${appointments[0].patient.name}:\n\n${itemsList}\n\nPor favor, informe as datas e horários encontrados e pergunte qual delas o paciente gostaria de desmarcar ou remarcar.`,
        data: {
          multiple: true,
          count: appointments.length,
          patientName: appointments[0].patient.name,
          dataFormatada: formatBRT(new Date(appointments[0].startTime)),
          status: appointments[0].status,
          appointments: appointments.map((a) => ({
            appointmentId: a.id,
            patientName: a.patient.name,
            startTime: a.startTime.toISOString(),
            dataFormatada: formatBRT(new Date(a.startTime)),
            status: a.status,
          })),
        },
      };
    }

    // Apenas 1 consulta futura encontrada
    const appointment = appointments[0];
    const dataFormatada = formatBRT(new Date(appointment.startTime));

    return {
      success: true,
      message: `Consulta encontrada para ${appointment.patient.name}:\n- Paciente: ${appointment.patient.name}\n- Data: ${dataFormatada}\n- Status: ${appointment.status}\n- Profissional: ${appointment.clinic.doctorName || appointment.clinic.name}\n- ID Agendamento: ${appointment.id}`,
      data: {
        appointmentId: appointment.id,
        patientName: appointment.patient.name,
        patientPhone: appointment.patient.phone,
        dataFormatada,
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
  clinicId?: string,
  preloadedAppointments?: any[]
): Promise<ToolResult> {
  try {
    // Obter primeira clínica se não fornecida
    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) {
      return { success: false, message: 'Consultório não encontrado no sistema.' };
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

    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 1. Data no passado
    if (cleanDateStr < todayISO) {
      return {
        success: true,
        message: 'A data solicitada já passou. Por favor, escolha uma data a partir de hoje.',
        data: { slots: [] },
      };
    }

    // Obter dia da semana em BRT (0 = Domingo, 1 = Segunda... 6 = Sábado)
    const dayOfWeek = targetDateStart.getDay().toString();

    let whRaw: any = clinic.workingHours;
    if (typeof whRaw === 'string') {
      try {
        whRaw = JSON.parse(whRaw);
      } catch {
        whRaw = null;
      }
    }
    const workingHoursConfig: any = (whRaw && typeof whRaw === 'object') ? whRaw : {};
    const metaAgenda: any = workingHoursConfig.meta || {};

    const selectedDaysList: string[] = (Array.isArray(metaAgenda.selectedDays) && metaAgenda.selectedDays.length > 0)
      ? metaAgenda.selectedDays.map(String)
      : ((Array.isArray(workingHoursConfig.selectedDays) && workingHoursConfig.selectedDays.length > 0)
        ? workingHoursConfig.selectedDays.map(String)
        : []);

    const scheduleStartDate: string = metaAgenda.scheduleStartDate || workingHoursConfig.scheduleStartDate || '';
    const scheduleEndDate: string = metaAgenda.scheduleEndDate || workingHoursConfig.scheduleEndDate || '';

    // GOVERNANÇA DA AGENDA MÉDICA: Apenas o médico/equipe humana define o período de abertura
    // Se o médico não cadastrou período ou dias de atendimento, a agenda está FECHADA para novos agendamentos
    if (!scheduleStartDate || !scheduleEndDate || selectedDaysList.length === 0) {
      return {
        success: true,
        message: 'A agenda de consultas deste consultório ainda não foi aberta pelo profissional para este período. Gostaria de entrar na lista de espera para ser avisado(a) assim que o médico liberar novas datas e horários?',
        data: { slots: [] },
      };
    }

    if (scheduleStartDate && cleanDateStr < scheduleStartDate) {
      const [sy, sm, sd] = scheduleStartDate.split('-');
      return {
        success: true,
        message: `A agenda de atendimentos do profissional para este período tem início em ${sd}/${sm}/${sy}. A data solicitada (${cleanDateStr}) é anterior à abertura da grade.`,
        data: { slots: [] },
      };
    }

    if (scheduleEndDate) {
      // Se a data final configurada pelo médico já passou, o período encerrou e o médico precisa abrir o próximo
      if (scheduleEndDate < todayISO) {
        const [ey, em, ed] = scheduleEndDate.split('-');
        return {
          success: true,
          message: `O período de agendamentos aberto pelo profissional foi encerrado em ${ed}/${em}/${ey} e novas datas ainda não foram liberadas pelo médico no sistema. Gostaria de entrar na lista de espera para ser avisado(a) assim que o profissional liberar novas vagas?`,
          data: { slots: [] },
        };
      }

      // Se a data solicitada for além da data final deliberada pelo profissional
      if (cleanDateStr > scheduleEndDate) {
        const [ey, em, ed] = scheduleEndDate.split('-');
        return {
          success: true,
          message: `A agenda deliberada pelo profissional para este período está aberta para atendimentos até ${ed}/${em}/${ey}. Datas posteriores ainda não foram liberadas pelo médico. Se desejar, posso adicionar você à nossa lista de espera prioritária para ser notificado(a) assim que novas datas forem abertas!`,
          data: { slots: [] },
        };
      }
    }

    // Determinar dias da semana atendidos: prioriza metaAgenda.selectedDays se houver, ou os dias com active: true em workingHoursConfig
    let activeDays: string[] = Array.isArray(selectedDaysList) ? selectedDaysList.map(String) : [];
    if (!activeDays || activeDays.length === 0) {
      activeDays = Object.keys(workingHoursConfig).filter((k) => workingHoursConfig[k]?.active).map(String);
    }
    if (activeDays.length === 0) {
      activeDays = ['1', '2', '3', '4', '5']; // Segunda a sexta por padrão
    }

    const diasNomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    if (!activeDays.includes(dayOfWeek)) {
      return {
        success: true,
        message: `O consultório não atende aos ${diasNomes[parseInt(dayOfWeek)]}s. Atendemos nos dias úteis (segunda a sexta).`,
        data: { slots: [] },
      };
    }

    let hasBreak = true;
    let startH = 8;
    let startM = 0;
    let endH = 17;
    let endM = 0;
    let bStart = metaAgenda.breakStartTime || '12:00';
    let bEnd = metaAgenda.breakEndTime || '13:00';

    if (workingHoursConfig && workingHoursConfig[dayOfWeek]) {
      const cfg = workingHoursConfig[dayOfWeek];
      if (cfg.active === false) {
        return {
          success: true,
          message: `O consultório não atende aos ${diasNomes[parseInt(dayOfWeek)]}s.`,
          data: { slots: [] },
        };
      }
      if (cfg.start) {
        const [sh, sm] = cfg.start.split(':').map(Number);
        startH = sh;
        startM = sm || 0;
      }
      if (cfg.end) {
        const [eh, em] = cfg.end.split(':').map(Number);
        endH = eh;
        endM = em || 0;
      }
      if (cfg.lunchStart && cfg.lunchEnd) {
        bStart = cfg.lunchStart;
        bEnd = cfg.lunchEnd;
      }
    } else {
      const wStart = metaAgenda.workStartTime || '08:00';
      const wEnd = metaAgenda.workEndTime || '17:00';
      bStart = metaAgenda.breakStartTime || '12:00';
      bEnd = metaAgenda.breakEndTime || '13:00';

      const [sh, sm] = wStart.split(':').map(Number);
      startH = sh;
      startM = sm || 0;
      const [eh, em] = wEnd.split(':').map(Number);
      endH = eh;
      endM = em || 0;
    }

    if (metaAgenda.breakEnabled !== undefined) {
      hasBreak = Boolean(metaAgenda.breakEnabled);
    }

    const [bsh, bsm] = bStart.split(':').map(Number);
    const [beh, bem] = bEnd.split(':').map(Number);
    const lunchStartMinutes = (bsh || 12) * 60 + (bsm || 0);
    const lunchEndMinutes = (beh || 13) * 60 + (bem || 0);

    const normDur = Number(metaAgenda.slotDurationMinutes || clinic.slotDurationMinutes) || 45;
    const retDur = Number(metaAgenda.returnSlotDurationMinutes) || 25;
    const returnSlotTimesList: string[] = Array.isArray(metaAgenda.returnSlotTimes)
      ? metaAgenda.returnSlotTimes
      : (Array.isArray(workingHoursConfig.returnSlotTimes) ? workingHoursConfig.returnSlotTimes : []);
    const returnSet = new Set(returnSlotTimesList);

    // Buscar agendamentos existentes no dia que NÃO estejam cancelados
    const startOfDay = parseBRT(`${cleanDateStr}T00:00:00`);
    const endOfDay = parseBRT(`${cleanDateStr}T23:59:59`);

    let existingAppointments = preloadedAppointments
      ? preloadedAppointments.filter((a) => {
          const st = new Date(a.startTime);
          const et = new Date(a.endTime);
          return st < endOfDay && et > startOfDay;
        })
      : await prisma.appointment.findMany({
          where: {
            clinicId: clinic.id,
            startTime: { lt: endOfDay },
            endTime: { gt: startOfDay },
            status: { notIn: ['CANCELADO', 'CANCELED'] },
          },
        });

    const now = new Date();
    let curMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const slots: string[] = [];

    while (curMinutes < endMinutes) {
      // Pular intervalo se dentro do almoço
      if (hasBreak && curMinutes >= lunchStartMinutes && curMinutes < lunchEndMinutes) {
        curMinutes = lunchEndMinutes;
        continue;
      }

      const h = Math.floor(curMinutes / 60);
      const m = curMinutes % 60;
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const isReturn = returnSet.has(timeStr);
      const dur = isReturn ? retDur : normDur;

      // Se a consulta cruzaria com o início do intervalo
      if (hasBreak && curMinutes < lunchStartMinutes && curMinutes + dur > lunchStartMinutes) {
        curMinutes = lunchEndMinutes;
        continue;
      }

      // Se ultrapassar o encerramento do expediente
      if (curMinutes + dur > endMinutes) {
        break;
      }

      const slotStart = parseBRT(`${cleanDateStr}T${timeStr}:00`);
      const slotEnd = addMinutes(slotStart, dur);
      const isFutureSlot = isAfter(slotStart, now);

      // Verificar se não colide com agendamento existente
      const isOccupied = existingAppointments.some((appt) => {
        const apptStart = new Date(appt.startTime);
        const apptEnd = new Date(appt.endTime);
        const apptTimeStr = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(apptStart);

        // Ocupado se o horário coincide exatamente com o início de uma consulta ou se há sobreposição de horário
        return apptTimeStr === timeStr || (slotStart < apptEnd && slotEnd > apptStart);
      });

      // REGRA DE OURO: Horários de Retorno (isReturn) NÃO são oferecidos no WhatsApp.
      // São de uso exclusivo e restrito para acompanhamento interno pelo médico ou recepcionista.
      if (isFutureSlot && !isOccupied && !isReturn) {
        const hourInt = h;
        let matchesPeriod = true;
        if (periodo === 'manha' && hourInt >= 12) matchesPeriod = false;
        if (periodo === 'tarde' && (hourInt < 12 || hourInt >= 18)) matchesPeriod = false;
        if (periodo === 'noite' && hourInt < 18) matchesPeriod = false;

        if (matchesPeriod) {
          slots.push(timeStr);
        }
      }

      curMinutes += dur;
    }

    const dataExtenso = formatBRT(targetDateStart, true);

    if (slots.length === 0) {
      return {
        success: true,
        message: `Não encontramos horários livres disponíveis para ${dataExtenso}${periodo !== 'qualquer' ? ` no período da ${periodo}` : ''}.`,
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
        message: `O cancelamento automático só pode ser feito com pelo menos ${minCancelHours} horas de antecedência. Entre em contato diretamente com o consultório.`,
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
      patient = await findPatientByPhone(patientPhone);
    }

    if (!patient) {
      return { success: false, message: 'Agendamento original não encontrado.' };
    }

    const clinic = oldAppointment?.clinic || (await prisma.clinic.findFirst());
    if (!clinic) {
      return { success: false, message: 'Consultório não encontrado no sistema.' };
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
        status: { notIn: ['CANCELADO', 'CANCELED', 'REMARCADO'] },
        startTime: { lt: newEnd },
        endTime: { gt: newStart },
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
 * 5. BUSCAR PRÓXIMOS DIAS E HORÁRIOS DISPONÍVEIS NA GRADE (ALTA VELOCIDADE)
 */
export async function buscarProximosHorariosDisponiveis(
  clinicId?: string,
  diasDesejados: number = 3
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

    // UMA ÚNICA QUERY PARA O INTERVALO DOS PRÓXIMOS DIAS RESPEITANDO A AGENDA DO MÉDICO:
    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let whConfig: any = {};
    try {
      whConfig = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
    } catch {}

    const meta = whConfig?.meta;

    // Se o médico configurou uma data final e ela já passou, a agenda está aguardando nova liberação pelo profissional
    if (meta?.scheduleEndDate && meta.scheduleEndDate < todayISO) {
      const [ey, em, ed] = meta.scheduleEndDate.split('-');
      return {
        success: true,
        message: `O período de agendamentos aberto pelo profissional foi encerrado em ${ed}/${em}/${ey} e novas datas ainda não foram disponibilizadas pelo médico.`,
        data: {
          days: [],
          formattedText: `No momento, a agenda de atendimentos do profissional para este período já foi encerrada e novas datas ainda não foram liberadas na grade pelo médico. Posso adicionar seu nome à nossa lista de espera prioritária para avisarmos assim que o consultório abrir as novas datas!`,
        },
      };
    }

    const futureLimit = meta?.scheduleEndDate
      ? new Date(parseBRT(`${meta.scheduleEndDate}T23:59:59`))
      : new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

    const allAppointments = await prisma.appointment.findMany({
      where: {
        clinicId: clinic.id,
        startTime: { gte: now, lte: futureLimit },
        status: { notIn: ['CANCELADO', 'CANCELED'] },
      },
    });

    const daysWithSlots: Array<{
      dateISO: string;
      formattedDate: string;
      slots: string[];
    }> = [];

    const checkDate = new Date(now);
    // Verificar até 60 dias à frente para cobrir com precisão todo o período aberto na agenda do médico
    const maxLookaheadDays = 60;

    for (let i = 0; i < maxLookaheadDays; i++) {
      if (daysWithSlots.length >= diasDesejados) break;

      const year = checkDate.getFullYear();
      const month = String(checkDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkDate.getDate()).padStart(2, '0');
      const dateISO = `${year}-${month}-${day}`;

      if (meta?.scheduleEndDate && dateISO > meta.scheduleEndDate) {
        break; // Respeita estritamente o limite de data deliberado pelo médico
      }

      const res = await buscarHorariosDisponiveis(dateISO, 'qualquer', clinic.id, allAppointments);
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
      const dataLimiteTexto = meta?.scheduleEndDate
        ? ` dentro do período aberto pelo médico (até ${meta.scheduleEndDate.split('-').reverse().join('/')})`
        : '';
      return {
        success: true,
        message: `Não há horários disponíveis nos próximos dias úteis${dataLimiteTexto}.`,
        data: {
          days: [],
          formattedText: `No momento, não localizamos horários livres na agenda${dataLimiteTexto}. Se desejar, posso adicionar você à nossa lista de espera para avisarmos caso surja uma desistência ou assim que novas datas forem abertas!`,
        },
      };
    }

    const lines: string[] = [];
    for (const d of daysWithSlots) {
      const displaySlots = d.slots.slice(0, 4).join(', ');
      const maisSlots = d.slots.length > 4 ? ` (e mais ${d.slots.length - 4} opções)` : '';
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
 * Verifica se a agenda do profissional possui pelo menos uma vaga livre disponível em todo o período aberto
 */
export async function verificarAgendaTemHorariosDisponiveis(clinicId?: string): Promise<{
  hasSlots: boolean;
  sampleDate?: string;
  sampleSlots?: string[];
}> {
  try {
    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) return { hasSlots: false };

    let whConfig: any = {};
    try {
      whConfig = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
    } catch {
      return { hasSlots: false };
    }

    const meta = whConfig?.meta;
    const selectedDaysList: string[] = Array.isArray(meta?.selectedDays)
      ? meta.selectedDays
      : (Array.isArray(whConfig?.selectedDays) ? whConfig.selectedDays : []);

    if (!meta?.scheduleStartDate || !meta?.scheduleEndDate || selectedDaysList.length === 0) {
      return { hasSlots: false };
    }

    const now = new Date();
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // A verificação deve iniciar na data de hoje ou no início do período configurado
    const startDateStr = todayISO > meta.scheduleStartDate ? todayISO : meta.scheduleStartDate;
    const endDateStr = meta.scheduleEndDate;

    if (startDateStr > endDateStr) {
      return { hasSlots: false };
    }

    const [sy, sm, sd] = startDateStr.split('-').map(Number);
    const [ey, em, ed] = endDateStr.split('-').map(Number);
    const curDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);

    let daysChecked = 0;
    while (curDate <= endDate && daysChecked < 90) {
      const y = curDate.getFullYear();
      const m = String(curDate.getMonth() + 1).padStart(2, '0');
      const d = String(curDate.getDate()).padStart(2, '0');
      const dateISO = `${y}-${m}-${d}`;
      const dow = curDate.getDay().toString();

      if (selectedDaysList.includes(dow)) {
        const res = await buscarHorariosDisponiveis(dateISO, 'qualquer', clinic.id);
        if (res.success && res.data?.slots && res.data.slots.length > 0) {
          return {
            hasSlots: true,
            sampleDate: dateISO,
            sampleSlots: res.data.slots,
          };
        }
      }

      curDate.setDate(curDate.getDate() + 1);
      daysChecked++;
    }

    return { hasSlots: false };
  } catch (err) {
    console.warn('⚠️ [verificarAgendaTemHorariosDisponiveis] Erro ao verificar agenda:', err);
    return { hasSlots: false };
  }
}

/**
 * 6. CRIAR NOVO AGENDAMENTO DE CONSULTA
 */
export async function criarNovoAgendamento(
  patientId: string,
  novaDataHora: string, // YYYY-MM-DD HH:mm
  clinicId?: string,
  beneficiarioNome?: string,
  beneficiarioNascimento?: string,
  beneficiarioCep?: string,
  beneficiarioTelefone?: string,
  beneficiarioCpf?: string
): Promise<ToolResult> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      return { success: false, message: 'Paciente titular não encontrado para realizar o agendamento.' };
    }

    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) {
      return { success: false, message: 'Consultório não encontrado no sistema.' };
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

    // Verificar se o horário solicitado está dentro dos dias e período da agenda deliberada pelo profissional
    if (clinic.workingHours) {
      try {
        const whConfig = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        const meta = whConfig?.meta;
        const selectedDaysList: string[] = Array.isArray(meta?.selectedDays)
          ? meta.selectedDays
          : (Array.isArray(whConfig?.selectedDays) ? whConfig.selectedDays : []);

        let activeDays: string[] = selectedDaysList;
        if (!activeDays || activeDays.length === 0) {
          activeDays = Object.keys(whConfig).filter((k) => whConfig[k]?.active);
        }
        if (activeDays.length === 0) {
          activeDays = ['1', '2', '3', '4', '5'];
        }

        const year = newStart.getFullYear();
        const month = String(newStart.getMonth() + 1).padStart(2, '0');
        const day = String(newStart.getDate()).padStart(2, '0');
        const dateISO = `${year}-${month}-${day}`;
        const dow = newStart.getDay().toString();

        if (meta?.scheduleStartDate && dateISO < meta.scheduleStartDate) {
          return {
            success: false,
            message: `A data desejada é anterior à abertura da agenda do profissional (${meta.scheduleStartDate}).`,
          };
        }
        if (meta?.scheduleEndDate && dateISO > meta.scheduleEndDate) {
          return {
            success: false,
            message: `A agenda do profissional para este período está aberta até ${meta.scheduleEndDate}.`,
          };
        }
        if (!activeDays.includes(dow)) {
          return {
            success: false,
            message: 'O profissional não atende neste dia da semana.',
          };
        }

        // REGRA DE RETORNO: Bloquear agendamento de horários de retorno via WhatsApp
        const returnSlotTimesList: string[] = Array.isArray(meta?.returnSlotTimes) ? meta.returnSlotTimes : [];
        const requestedTimeStr = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(newStart);

        if (returnSlotTimesList.includes(requestedTimeStr)) {
          return {
            success: false,
            message: `O horário das ${requestedTimeStr} é reservado exclusivamente para consultas de retorno de pacientes em acompanhamento. Por favor, escolha outro horário disponível para nova consulta.`,
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
        status: { notIn: ['CANCELADO', 'CANCELED'] },
        startTime: { lt: newEnd },
        endTime: { gt: newStart },
      },
    });

    if (conflict) {
      return {
        success: false,
        message: 'Desculpe, este horário acabou de ser ocupado. Por favor, escolha outro horário.',
      };
    }

    // GESTÃO CADASTRO DO PACIENTE: Vincular ao paciente real (titular ou terceiro)
    let targetPatient = patient;
    let notes = 'Agendado via WhatsApp Bot (1º Contato)';

    if (beneficiarioNome && beneficiarioNome.trim().toLowerCase() !== patient.name.trim().toLowerCase()) {
      const cleanBeneficiario = beneficiarioNome.trim();
      let beneficiary = await prisma.patient.findFirst({
        where: {
          clinicId: clinic.id,
          name: { equals: cleanBeneficiario, mode: 'insensitive' },
        },
      });

      if (!beneficiary) {
        // Gerar telefone identificador seguro com sufixo caso compartilhe o telefone do titular
        const basePhone = patient.phone.split('-')[0];
        let candidatePhone = basePhone;
        let suffix = 2;
        while (await prisma.patient.findFirst({ where: { clinicId: clinic.id, phone: candidatePhone } })) {
          candidatePhone = `${basePhone}-${suffix}`;
          suffix++;
        }

        beneficiary = await prisma.patient.create({
          data: {
            clinicId: clinic.id,
            name: cleanBeneficiario,
            phone: beneficiarioTelefone ? beneficiarioTelefone.replace(/\D/g, '') : candidatePhone,
            cpf: beneficiarioCpf ? beneficiarioCpf.trim() : null,
            birthDate: beneficiarioNascimento ? beneficiarioNascimento.trim() : null,
            cep: beneficiarioCep ? beneficiarioCep.trim() : null,
            notes: `Cadastrado via WhatsApp por titular: ${patient.name} (${patient.phone})`,
          },
        });
      } else {
        const updateData: any = {};
        if (beneficiarioCpf && !beneficiary.cpf) updateData.cpf = beneficiarioCpf.trim();
        if (beneficiarioNascimento) updateData.birthDate = beneficiarioNascimento.trim();
        if (beneficiarioCep) updateData.cep = beneficiarioCep.trim();

        if (Object.keys(updateData).length > 0) {
          beneficiary = await prisma.patient.update({
            where: { id: beneficiary.id },
            data: updateData,
          });
        }
      }

      targetPatient = beneficiary;
      notes = `Agendamento para: ${cleanBeneficiario} (Titular WhatsApp: ${patient.name})`;
    } else {
      // Agendamento para o próprio titular
      const updateData: any = {};
      if (beneficiarioCpf && !patient.cpf) updateData.cpf = beneficiarioCpf.trim();
      if (beneficiarioNascimento) updateData.birthDate = beneficiarioNascimento.trim();
      if (beneficiarioCep) updateData.cep = beneficiarioCep.trim();

      if (Object.keys(updateData).length > 0) {
        targetPatient = await prisma.patient.update({
          where: { id: patient.id },
          data: updateData,
        });
      }
    }

    // REGRA DE CADASTRO OBRIGATÓRIO: Apenas Nome completo e (CPF ou Telefone)
    // CEP e Data de Nascimento NÃO são mais exigidos no atendimento via WhatsApp!
    if (!targetPatient.name || targetPatient.name === 'Paciente' || targetPatient.name === 'Titular WhatsApp') {
      return {
        success: false,
        message: `Para registrar a consulta, precisamos do Nome completo e CPF do paciente que será atendido. Por favor, confirme esses dados antes de finalizar o agendamento.`,
        data: {
          needsRegistration: true,
          patientName: targetPatient.name,
          missingFields: ['nome', 'cpf'],
        },
      };
    }

    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: targetPatient.id, // VINCULADO DIRETAMENTE AO PACIENTE DA CONSULTA!
        startTime: newStart,
        endTime: newEnd,
        status: 'AGENDADO',
        notes,
      },
    });

    // Se o paciente estava na Fila de Espera (AGUARDANDO ou NOTIFICADO), atualizar para AGENDADO
    try {
      const pAny = prisma as any;
      if (pAny.waitlist) {
        const rawTargetPhone = (targetPatient.phone || '').split('-')[0].replace(/\D/g, '');
        const rawTitularPhone = (patient.phone || '').split('-')[0].replace(/\D/g, '');
        const cleanTargetPhone = rawTargetPhone.slice(-8);
        const cleanTitularPhone = rawTitularPhone.slice(-8);

        // 1. Prioridade máxima: buscar pelo nome do paciente ou ID do paciente que passará pela consulta
        let waitlistEntry = await pAny.waitlist.findFirst({
          where: {
            clinicId: clinic.id,
            status: { in: ['NOTIFICADO', 'AGUARDANDO'] },
            OR: [
              ...(targetPatient.id ? [{ patientId: targetPatient.id }] : []),
              { patientName: { equals: targetPatient.name.trim(), mode: 'insensitive' } },
              { patientName: { contains: targetPatient.name.trim(), mode: 'insensitive' } },
            ],
          },
          orderBy: [
            { status: 'desc' }, // NOTIFICADO vem antes de AGUARDANDO
            { createdAt: 'desc' },
          ],
        });

        // 2. Se não encontrou por nome/ID, busca pelos telefones limpos (sem sufixos -2, -3)
        if (!waitlistEntry && (cleanTargetPhone || cleanTitularPhone)) {
          waitlistEntry = await pAny.waitlist.findFirst({
            where: {
              clinicId: clinic.id,
              status: { in: ['NOTIFICADO', 'AGUARDANDO'] },
              OR: [
                ...(cleanTargetPhone ? [{ patientPhone: { contains: cleanTargetPhone } }] : []),
                ...(cleanTitularPhone ? [{ patientPhone: { contains: cleanTitularPhone } }] : []),
              ],
            },
            orderBy: [
              { status: 'desc' },
              { createdAt: 'desc' },
            ],
          });
        }

        if (waitlistEntry) {
          const dateDisp = formatBRTShort(newStart);
          await updateWaitlistEntry(waitlistEntry.id, {
            status: 'AGENDADO',
            offeredSlot: {
              startTime: newStart.toISOString(),
              endTime: newEnd.toISOString(),
              dateDisplay: dateDisp.split(' às')[0],
              timeDisplay: dateDisp.split(' às')[1]?.trim() || '',
            },
            notes: `${waitlistEntry.notes || ''} [Consulta Agendada: ${dateDisp}]`.trim(),
          });
          console.log(`✅ [Fila de Espera] Card do paciente ${targetPatient.name} (ID: ${waitlistEntry.id}) evoluído para AGENDADO na fila de espera.`);
        }
      }
    } catch (waitlistSyncErr) {
      console.warn('⚠️ [Fila de Espera] Aviso ao evoluir status na fila de espera:', waitlistSyncErr);
    }

    const dataFormatada = formatBRT(newStart, true);
    return {
      success: true,
      message: `Agendamento confirmado para ${dataFormatada}! Paciente: ${targetPatient.name}.`,
      data: {
        appointmentId: newAppointment.id,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        patientName: targetPatient.name,
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

/**
 * 7. TRANSFERIR ATENDIMENTO PARA ATENDENTE HUMANO (RECEPCIONISTA)
 */
export async function transferirParaHumano(telefonePaciente: string, motivo?: string, clinicId?: string): Promise<ToolResult> {
  try {
    const patient = await findPatientByPhone(telefonePaciente, clinicId);

    if (patient) {
      await (prisma.patient as any).update({
        where: { id: patient.id },
        data: {
          humanHandoff: true,
          humanHandoffAt: new Date(),
        },
      });
      console.log(`🙋‍♂️ [Transbordo Humano] Paciente ${patient.name} (${telefonePaciente}) transferido para recepcionista. Motivo: ${motivo || 'Solicitação direta'}`);
    }

    return {
      success: true,
      message: 'Atendimento transferido com sucesso para a equipe humana da recepção.',
      data: { transferido: true, motivo },
    };
  } catch (error: any) {
    console.error('Erro em transferirParaHumano:', error);
    return {
      success: false,
      message: `Falha ao transferir para humano: ${error.message}`,
    };
  }
}

/**
 * 8. ADICIONAR PACIENTE À LISTA DE ESPERA
 */
export async function adicionarFilaEspera(
  telefonePaciente: string,
  pacienteNome: string,
  turnoPreferido?: string,
  diasPreferidos?: string,
  clinicId?: string,
  dataDesejada?: string
): Promise<ToolResult> {
  try {
    let targetClinicId = clinicId;
    if (!targetClinicId) {
      const clinic = await prisma.clinic.findFirst();
      targetClinicId = clinic?.id;
    }
    if (!targetClinicId) {
      return { success: false, message: 'Consultório não encontrado.' };
    }

    const patient = await findPatientByPhone(telefonePaciente, targetClinicId);

    // REGRA DE SEGURANÇA: Só pode adicionar na fila de espera pacientes com cadastro prévio e CPF
    const hasCpf = patient?.cpf && patient.cpf.replace(/\D/g, '').length >= 11;
    if (!patient || !hasCpf) {
      return {
        success: false,
        message: `Para incluir você na nossa Lista de Espera prioritária, precisamos primeiro cadastrar seu Nome completo e CPF no consultório. Por favor, confirme seu Nome completo e o número do seu CPF.`,
        data: { needsRegistration: true },
      };
    }

    let shift: 'Manhã' | 'Tarde' | 'Qualquer Horário' = 'Qualquer Horário';
    if (turnoPreferido?.toLowerCase().includes('manh')) shift = 'Manhã';
    else if (turnoPreferido?.toLowerCase().includes('tard')) shift = 'Tarde';

    let dataDesejadaFormatada = dataDesejada ? dataDesejada.trim() : '';
    const isoMatch = dataDesejadaFormatada.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      dataDesejadaFormatada = `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
    }

    let noteExtra = 'Adicionado pelo Secretário Virtual IA';
    if (dataDesejadaFormatada) {
      noteExtra = `Data desejada: ${dataDesejadaFormatada} | Turno: ${shift}`;
    }

    const entry = await addToWaitlist({
      patientId: patient?.id,
      patientName: pacienteNome || patient?.name || 'Paciente',
      patientPhone: telefonePaciente,
      preferredShift: shift,
      preferredDays: diasPreferidos || (dataDesejadaFormatada ? `Data desejada: ${dataDesejadaFormatada}` : 'Qualquer dia útil'),
      desiredDate: dataDesejadaFormatada || undefined,
      notes: noteExtra,
    });

    const confirmComplemento = dataDesejadaFormatada
      ? ` para o período em torno de ${dataDesejadaFormatada}`
      : '';

    return {
      success: true,
      message: `Você foi adicionado à nossa lista de espera com sucesso${confirmComplemento}! Assim que o médico abrir novas datas para este período ou surgir uma desistência, avisaremos você com prioridade aqui no WhatsApp.`,
      data: entry,
    };
  } catch (error: any) {
    console.error('Erro em adicionarFilaEspera:', error);
    return {
      success: false,
      message: `Erro ao adicionar à lista de espera: ${error.message}`,
    };
  }
}

/**
 * 9. OBTER INFORMAÇÕES E REGRAS INSTITUCIONAIS DO CONSULTÓRIO
 */
export async function obterInformacoesClinica(clinicId?: string): Promise<ToolResult> {
  try {
    let clinic = clinicId ? await prisma.clinic.findUnique({ where: { id: clinicId } }) : await prisma.clinic.findFirst();
    if (!clinic) {
      return { success: false, message: 'Informações do consultório não localizadas.' };
    }

    const doctor = await prisma.user.findFirst({
      where: { role: 'MEDICO', status: 'ACTIVE' },
    });

    let meta: any = {};
    if (clinic.workingHours) {
      try {
        const wh = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        meta = wh?.meta || {};
      } catch (err) {}
    }

    return {
      success: true,
      message: 'Informações do consultório recuperadas com sucesso.',
      data: {
        nomeClinica: clinic.name,
        medicoNome: doctor?.name || clinic.doctorName || 'Dra. Mariana Souza',
        especialidade: doctor?.specialty || clinic.specialty || 'Pediatria',
        crm: doctor?.crm || clinic.crm || 'CRM/SP 148.910',
        telefone: clinic.phone,
        email: clinic.email,
        endereco: clinic.address || 'Consultório Iterum - Atendimento presencial e telemedicina',
        tempoConsultaMinutos: clinic.slotDurationMinutes,
        prazoMinimoCancelamentoHoras: clinic.minCancelHours,
        valorConsulta: meta.consultationFee || 'Não informado / sob consulta',
        atendeConvenio: Boolean(meta.acceptsInsurance),
        conveniosAtendidos: meta.insurancePlans || 'Nenhum convênio cadastrado (somente particular)',
        observacoesConvenio: meta.insuranceNotes || '',
      },
    };
  } catch (error: any) {
    console.error('Erro em obterInformacoesClinica:', error);
    return {
      success: false,
      message: `Erro ao obter dados do consultório: ${error.message}`,
    };
  }
}

/**
 * 10. CONFIRMAR PRESENÇA NA CONSULTA (Lembrete de Véspera D-1)
 */
export async function confirmarPresencaConsulta(
  telefonePaciente: string,
  agendamentoId?: string,
  clinicId?: string
): Promise<ToolResult> {
  try {
    const cleanPhone = telefonePaciente.replace(/\D/g, '');
    let appointment = null;

    if (agendamentoId) {
      appointment = await prisma.appointment.findUnique({
        where: { id: agendamentoId },
        include: { patient: true, clinic: true },
      });
    } else {
      const patient = await findPatientByPhone(telefonePaciente, clinicId);

      if (patient) {
        appointment = await prisma.appointment.findFirst({
          where: {
            patientId: patient.id,
            startTime: { gte: new Date() },
            status: { in: ['AGENDADO', 'SCHEDULED'] },
          },
          orderBy: { startTime: 'asc' },
          include: { patient: true, clinic: true },
        });
      }
    }

    if (!appointment) {
      return {
        success: false,
        message: 'Nenhum agendamento futuro pendente de confirmação foi localizado para este paciente.',
      };
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CONFIRMADO',
        notes: appointment.notes
          ? `${appointment.notes} | Presença confirmada pelo paciente via WhatsApp`
          : 'Presença confirmada pelo paciente via WhatsApp',
      },
      include: { patient: true, clinic: true },
    });

    const dataFormatada = formatBRT(new Date(updated.startTime), true);

    return {
      success: true,
      message: `Presença confirmada com sucesso para a consulta de ${updated.patient.name} em ${dataFormatada}!`,
      data: {
        appointmentId: updated.id,
        patientName: updated.patient.name,
        startTime: updated.startTime.toISOString(),
        status: updated.status,
      },
    };
  } catch (error: any) {
    console.error('Erro em confirmarPresencaConsulta:', error);
    return {
      success: false,
      message: `Erro ao confirmar presença: ${error.message}`,
    };
  }
}

/**
 * 11. CADASTRAR OU ATUALIZAR PACIENTE NO SISTEMA
 * Obrigatório: Nome completo e CPF antes de qualquer agendamento.
 * Realiza busca prévia por CPF no banco de dados da clínica para reutilizar cadastros existentes.
 */
export async function cadastrarPaciente({
  telefoneTitular,
  nomeCompleto,
  cpf,
  eParaOutraPessoa = false,
  nomeInterlocutor,
  telefoneProprio,
  dataNascimento,
  cep,
  clinicId,
}: {
  telefoneTitular: string;
  nomeCompleto: string;
  cpf?: string;
  eParaOutraPessoa?: boolean;
  nomeInterlocutor?: string;
  telefoneProprio?: string;
  dataNascimento?: string;
  cep?: string;
  clinicId?: string;
}): Promise<ToolResult> {
  try {
    const clinic = clinicId
      ? await prisma.clinic.findUnique({ where: { id: clinicId } })
      : await prisma.clinic.findFirst();

    if (!clinic) {
      return { success: false, message: 'Consultório não encontrado no sistema.' };
    }

    const cleanTitularPhone = telefoneTitular.replace(/\D/g, '');
    const formattedTitularPhone = cleanTitularPhone.startsWith('55')
      ? `+${cleanTitularPhone}`
      : `+55${cleanTitularPhone}`;

    const rawCpf = (cpf || '').trim();
    const cleanCpf = rawCpf.replace(/\D/g, '');
    const formattedCpf =
      cleanCpf.length === 11
        ? `${cleanCpf.slice(0, 3)}.${cleanCpf.slice(3, 6)}.${cleanCpf.slice(6, 9)}-${cleanCpf.slice(9)}`
        : rawCpf;

    // 1. Verificar se já existe paciente com este CPF cadastrado na clínica
    const existingByCpf =
      cleanCpf.length >= 11
        ? await prisma.patient.findFirst({
            where: {
              clinicId: clinic.id,
              OR: [{ cpf: cleanCpf }, { cpf: formattedCpf }],
            },
          })
        : null;

    // 2. Localizar ou registrar o paciente titular do WhatsApp
    let titular = await findPatientByPhone(telefoneTitular, clinicId);

    if (!titular) {
      titular = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: nomeInterlocutor?.trim() || (eParaOutraPessoa ? 'Titular WhatsApp' : nomeCompleto.trim()),
          phone: formattedTitularPhone,
          cpf: !eParaOutraPessoa && formattedCpf ? formattedCpf : null,
        },
      });
    } else if (nomeInterlocutor && nomeInterlocutor.trim()) {
      // Se informou o nome da mãe/responsável, garantir que o titular guarde o nome correto
      const cleanInterlocutor = nomeInterlocutor.trim();
      if (titular.name !== cleanInterlocutor && (titular.name === 'Paciente' || titular.name === 'Titular WhatsApp')) {
        titular = await prisma.patient.update({
          where: { id: titular.id },
          data: { name: cleanInterlocutor },
        });
      }
    }

    // Se já encontramos um paciente existente por CPF na clínica
    if (existingByCpf) {
      if (!eParaOutraPessoa && existingByCpf.id !== titular.id) {
        await prisma.patient.update({
          where: { id: titular.id },
          data: {
            name: existingByCpf.name || nomeCompleto.trim(),
            cpf: formattedCpf,
          },
        });
      }

      return {
        success: true,
        message: `✅ Cadastro do paciente ${existingByCpf.name} LOCALIZADO no sistema (CPF: ${formattedCpf})!\n⚠️ ATENÇÃO OBRIGATÓRIA PARA A SOFIA: NÃO liste outros dias e horários novamente se o paciente já havia escolhido um dia e horário na mensagem anterior! Mantenha a data e o horário que ele escolheu e responda com o resumo de confirmação (Paciente, CPF, Data e Horário) perguntando: "Posso confirmar para você?".`,
        data: {
          patientId: existingByCpf.id,
          patientName: existingByCpf.name,
          cpf: formattedCpf,
          phone: existingByCpf.phone,
          alreadyExisted: true,
        },
      };
    }

    // Proteção de segurança: se o titular já tiver nome real diferente do nome a ser cadastrado,
    // trata com segurança como outra pessoa/dependente para nunca apagar o nome do responsável!
    const titularHasRealName =
      titular.name &&
      titular.name !== 'Paciente' &&
      titular.name !== 'Titular WhatsApp';
    const isNameDifferent =
      titularHasRealName &&
      !titular.name.toLowerCase().includes(nomeCompleto.trim().toLowerCase()) &&
      !nomeCompleto.trim().toLowerCase().includes(titular.name.toLowerCase());

    const isForOtherPerson = Boolean(eParaOutraPessoa || isNameDifferent);

    // CASO 1: O titular está se cadastrando para si mesmo
    if (!isForOtherPerson) {
      const updatedTitular = await prisma.patient.update({
        where: { id: titular.id },
        data: {
          name: nomeCompleto.trim(),
          cpf: formattedCpf || titular.cpf,
          birthDate: dataNascimento ? dataNascimento.trim() : titular.birthDate,
          cep: cep ? cep.trim() : titular.cep,
        },
      });

      return {
        success: true,
        message: `✅ Cadastro de ${updatedTitular.name} salvo com sucesso no sistema (CPF: ${formattedCpf || 'Registrado'})!\n⚠️ ATENÇÃO OBRIGATÓRIA PARA A SOFIA: NÃO liste outros dias e horários novamente se o paciente já havia escolhido um dia e horário na mensagem anterior! Mantenha a data e o horário que ele escolheu e responda com o resumo de confirmação (Paciente, CPF, Data e Horário) perguntando: "Posso confirmar para você?".`,
        data: {
          patientId: updatedTitular.id,
          patientName: updatedTitular.name,
          cpf: formattedCpf,
          phone: updatedTitular.phone,
          alreadyExisted: false,
        },
      };
    }

    // CASO 2: O titular está cadastrando OUTRA pessoa (beneficiário / dependente / filho / familiar)
    const cleanNome = nomeCompleto.trim();
    let beneficiary = await prisma.patient.findFirst({
      where: {
        clinicId: clinic.id,
        name: { equals: cleanNome, mode: 'insensitive' },
      },
    });

    if (beneficiary) {
      beneficiary = await prisma.patient.update({
        where: { id: beneficiary.id },
        data: {
          cpf: formattedCpf || beneficiary.cpf,
          birthDate: dataNascimento ? dataNascimento.trim() : beneficiary.birthDate,
          cep: cep ? cep.trim() : beneficiary.cep,
        },
      });
    } else {
      let phoneToUse = telefoneProprio ? telefoneProprio.replace(/\D/g, '') : '';
      if (phoneToUse) {
        phoneToUse = phoneToUse.startsWith('55') ? `+${phoneToUse}` : `+55${phoneToUse}`;
      } else {
        const basePhone = formattedTitularPhone.split('-')[0];
        let candidatePhone = basePhone;
        let suffix = 2;
        while (await prisma.patient.findFirst({ where: { clinicId: clinic.id, phone: candidatePhone } })) {
          candidatePhone = `${basePhone}-${suffix}`;
          suffix++;
        }
        phoneToUse = candidatePhone;
      }

      beneficiary = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: cleanNome,
          phone: phoneToUse,
          cpf: formattedCpf || null,
          birthDate: dataNascimento ? dataNascimento.trim() : null,
          cep: cep ? cep.trim() : null,
          notes: `Cadastrado via WhatsApp por titular: ${titular.name} (${titular.phone})`,
        },
      });
    }

    return {
      success: true,
      message: `✅ Paciente ${beneficiary.name} CADASTRADO como paciente beneficiário da consulta (CPF: ${formattedCpf || 'Registrado'})!\n⚠️ ALERTA DE TRATAMENTO PARA A SOFIA: Você está conversando no WhatsApp com o(a) responsável (${titular.name || 'titular do WhatsApp'}). NUNCA passe a chamar o(a) responsável pelo nome do paciente cadastrado (${beneficiary.name}). NÃO chame criar_novo_agendamento agora! Apresente o resumo do agendamento destacando Paciente (${beneficiary.name}) e Responsável (${titular.name}), e pergunte: "Posso confirmar para você?". Aguarde a confirmação do paciente.`,
      data: {
        patientId: beneficiary.id,
        patientName: beneficiary.name,
        cpf: formattedCpf,
        phone: beneficiary.phone,
        titularName: titular.name,
        titularPhone: titular.phone,
        alreadyExisted: false,
      },
    };
  } catch (error: any) {
    console.error('Erro em cadastrarPaciente:', error);
    return {
      success: false,
      message: `Erro ao cadastrar paciente: ${error.message}`,
    };
  }
}


