import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import { sendWhatsAppMessage } from './whatsapp/client';

export interface WaitlistEntry {
  id: string;
  patientId?: string;
  patientName: string;
  patientPhone: string;
  preferredShift: 'Manhã' | 'Tarde' | 'Qualquer Horário';
  preferredDays?: string;
  status: 'AGUARDANDO' | 'NOTIFICADO' | 'AGENDADO' | 'RECUSADO';
  notes?: string;
  createdAt: string;
  notifiedAt?: string | null;
  offeredSlot?: {
    startTime: string; // ISO string
    endTime?: string;
    dateDisplay: string; // e.g. "29/10/2026"
    timeDisplay: string; // e.g. "14:00"
  } | null;
}

const WAITLIST_FILE_PATH = path.join(process.cwd(), 'data', 'waitlist.json');

/**
 * Normaliza e converte strings/Dates para objeto Date garantindo fuso horário correto (Brasília / America/Sao_Paulo)
 */
export function toBRTDate(val: string | Date): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    if (val.includes('Z') || /[+-]\d{2}:\d{2}$/.test(val)) {
      return new Date(val);
    }
    let s = val.trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) s += '-03:00';
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date(val) : d;
  }
  return new Date(val);
}

// Lista inicial zerada (começa sem nenhum paciente para testes limpos)
const INITIAL_WAITLIST: WaitlistEntry[] = [];

let inMemoryWaitlist: WaitlistEntry[] | null = null;

function ensureDataDirectory() {
  const dir = path.dirname(WAITLIST_FILE_PATH);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      // Ignora erro se não for possível criar
    }
  }
}

export function loadWaitlist(): WaitlistEntry[] {
  if (inMemoryWaitlist) {
    return inMemoryWaitlist;
  }
  ensureDataDirectory();
  try {
    if (fs.existsSync(WAITLIST_FILE_PATH)) {
      const data = fs.readFileSync(WAITLIST_FILE_PATH, 'utf-8');
      inMemoryWaitlist = JSON.parse(data);
      return inMemoryWaitlist || [];
    }
  } catch (err) {
    console.warn('⚠️ [Waitlist] Erro ao ler arquivo, usando inicial:', err);
  }
  inMemoryWaitlist = [...INITIAL_WAITLIST];
  saveWaitlist(inMemoryWaitlist);
  return inMemoryWaitlist;
}

export function saveWaitlist(list: WaitlistEntry[]): void {
  inMemoryWaitlist = list;
  ensureDataDirectory();
  try {
    fs.writeFileSync(WAITLIST_FILE_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️ [Waitlist] Erro ao salvar arquivo:', err);
  }
}

/**
 * Zera completamente a fila de espera
 */
export function clearWaitlist(): void {
  inMemoryWaitlist = [];
  saveWaitlist([]);
}

/**
 * Adicionar paciente à fila de espera
 */
export async function addToWaitlist(data: {
  patientId?: string;
  patientName: string;
  patientPhone: string;
  preferredShift?: 'Manhã' | 'Tarde' | 'Qualquer Horário';
  preferredDays?: string;
  notes?: string;
}): Promise<WaitlistEntry> {
  const list = loadWaitlist();
  const cleanPhone = data.patientPhone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`;

  // Se já estiver na fila aguardando ou notificado, apenas atualiza
  const existingIndex = list.findIndex(
    (item) => item.patientPhone.replace(/\D/g, '') === cleanPhone && (item.status === 'AGUARDANDO' || item.status === 'NOTIFICADO')
  );

  if (existingIndex >= 0) {
    list[existingIndex] = {
      ...list[existingIndex],
      patientName: data.patientName || list[existingIndex].patientName,
      preferredShift: data.preferredShift || list[existingIndex].preferredShift,
      preferredDays: data.preferredDays || list[existingIndex].preferredDays,
      notes: data.notes || list[existingIndex].notes,
    };
    saveWaitlist(list);
    return list[existingIndex];
  }

  const newEntry: WaitlistEntry = {
    id: `wait-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    patientId: data.patientId,
    patientName: data.patientName.trim(),
    patientPhone: formattedPhone,
    preferredShift: data.preferredShift || 'Qualquer Horário',
    preferredDays: data.preferredDays || 'Qualquer dia útil',
    status: 'AGUARDANDO',
    notes: data.notes || 'Cadastrado na Fila de Espera',
    createdAt: new Date().toISOString(),
    notifiedAt: null,
    offeredSlot: null,
  };

  list.push(newEntry);
  saveWaitlist(list);
  return newEntry;
}

/**
 * Atualizar status de um item da fila
 */
export function updateWaitlistEntry(id: string, updates: Partial<WaitlistEntry>): WaitlistEntry | null {
  const list = loadWaitlist();
  const index = list.findIndex((i) => i.id === id);
  if (index === -1) return null;
  list[index] = { ...list[index], ...updates };
  saveWaitlist(list);
  return list[index];
}

/**
 * Remover da fila
 */
export function removeFromWaitlist(id: string): boolean {
  const list = loadWaitlist();
  const filtered = list.filter((i) => i.id !== id);
  if (filtered.length !== list.length) {
    saveWaitlist(filtered);
    return true;
  }
  return false;
}

/**
 * Obter o nome do médico da clínica para as mensagens
 */
async function getDoctorName(): Promise<string> {
  try {
    const clinic = await prisma.clinic.findFirst();
    if (clinic?.doctorName) return clinic.doctorName;
    if (clinic?.name) return clinic.name;
  } catch (e) {
    // fallback
  }
  return 'Dra. Mariana Souza';
}

/**
 * Disparar notificação automática para o 1º paciente da Fila de Espera quando uma consulta é remarcada ou cancelada
 */
export async function notifyFirstInWaitlistForVacatedSlot(vacatedSlot: {
  startTime: string | Date;
  endTime?: string | Date;
}): Promise<{
  contacted: boolean;
  patient?: WaitlistEntry;
  message?: string;
  whatsappResult?: any;
}> {
  const list = loadWaitlist();

  // Encontrar o 1º paciente na fila com status AGUARDANDO
  const targetIndex = list.findIndex((i) => i.status === 'AGUARDANDO');
  if (targetIndex === -1) {
    console.log('ℹ️ [Fila de Espera] Ninguém aguardando na fila no momento.');
    return { contacted: false, message: 'Nenhum paciente aguardando na fila de espera no momento.' };
  }

  const patient = list[targetIndex];
  const doctorName = await getDoctorName();

  // Formatar data e hora com fuso de Brasília (America/Sao_Paulo)
  const startDate = toBRTDate(vacatedSlot.startTime);

  const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const weekDayFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
  });

  const startFormatted = timeFormatter.format(startDate);
  let timeDisplay = startFormatted;
  let endDateISO: string | undefined = undefined;

  if (vacatedSlot.endTime) {
    const endDate = toBRTDate(vacatedSlot.endTime);
    endDateISO = endDate.toISOString();
    const endFormatted = timeFormatter.format(endDate);
    timeDisplay = `${startFormatted} às ${endFormatted}`;
  }

  const dateDisplay = dateFormatter.format(startDate);
  const weekDayDisplay = weekDayFormatter.format(startDate);

  const offeredSlot = {
    startTime: startDate.toISOString(),
    endTime: endDateISO,
    dateDisplay,
    timeDisplay,
  };

  // Mensagem WhatsApp para o paciente da fila
  const messageText = `Olá ${patient.patientName}! Um horário acaba de ser liberado com ${doctorName}:\n\n📅 Data: *${dateDisplay}* (${weekDayDisplay})\n⏰ Horário: *${timeDisplay}*\n\nComo você está na nossa *Fila de Espera*, este horário foi reservado com prioridade para você!\n\nVocê tem interesse em agendar neste horário?\n\n[1] SIM, tenho interesse\n[2] NÃO tenho interesse`;

  console.log(`🚀 [Fila de Espera] Contactando 1º da fila (${patient.patientName} - ${patient.patientPhone}) para o horário vago de ${dateDisplay} às ${timeDisplay}`);

  const whatsappResult = await sendWhatsAppMessage(patient.patientPhone, messageText, [
    { id: 'btn_waitlist_sim', title: 'SIM, tenho interesse' },
    { id: 'btn_waitlist_nao', title: 'NÃO tenho interesse' },
  ]);

  // Atualizar paciente na fila como NOTIFICADO
  list[targetIndex] = {
    ...patient,
    status: 'NOTIFICADO',
    notifiedAt: new Date().toISOString(),
    offeredSlot,
  };
  saveWaitlist(list);

  // Registrar a mensagem no histórico do WhatsApp para garantir continuidade no bot
  try {
    const cleanP = patient.patientPhone.replace(/\D/g, '').slice(-8);
    let dbPatient = await prisma.patient.findFirst({
      where: {
        phone: { contains: cleanP },
      },
    });

    const clinic = await prisma.clinic.findFirst();

    if (!dbPatient && clinic) {
      dbPatient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: patient.patientName,
          phone: patient.patientPhone,
        },
      });
    }

    if (dbPatient && clinic) {
      await prisma.message.create({
        data: {
          clinicId: clinic.id,
          patientId: dbPatient.id,
          role: 'assistant',
          content: messageText,
        },
      });
      console.log(`📝 [Fila de Espera] Mensagem de oferta salva no histórico do paciente ${dbPatient.name}`);
    }
  } catch (msgErr) {
    console.warn('⚠️ [Fila de Espera] Não foi possível salvar mensagem de oferta no histórico:', msgErr);
  }

  return {
    contacted: true,
    patient: list[targetIndex],
    message: `1º paciente da Fila de Espera (${patient.patientName}) contactado via WhatsApp para o horário ${dateDisplay} às ${timeDisplay}.`,
    whatsappResult,
  };
}

/**
 * Confirmar agendamento do paciente da fila e preencher a lacuna da agenda
 */
export async function confirmWaitlistBooking(
  waitlistId: string,
  clinicId?: string
): Promise<{ success: boolean; appointment?: any; message: string }> {
  const list = loadWaitlist();
  const entry = list.find((i) => i.id === waitlistId);
  if (!entry || !entry.offeredSlot) {
    return { success: false, message: 'Entrada da fila de espera ou horário ofertado não encontrado.' };
  }

  try {
    let clinic = clinicId ? await prisma.clinic.findUnique({ where: { id: clinicId } }) : await prisma.clinic.findFirst();
    if (!clinic) {
      clinic = await prisma.clinic.findFirst();
    }

    if (!clinic) {
      return { success: false, message: 'Clínica não encontrada no sistema.' };
    }

    // Buscar ou criar o paciente no banco
    let patient = await prisma.patient.findFirst({
      where: {
        clinicId: clinic.id,
        phone: { contains: entry.patientPhone.replace(/\D/g, '').slice(-8) },
      },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: entry.patientName,
          phone: entry.patientPhone,
        },
      });
    }

    const start = new Date(entry.offeredSlot.startTime);
    const end = entry.offeredSlot.endTime ? new Date(entry.offeredSlot.endTime) : new Date(start.getTime() + (clinic.slotDurationMinutes || 30) * 60000);

    // Criar o agendamento preenchendo a lacuna
    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        startTime: start,
        endTime: end,
        status: 'CONFIRMADO',
        notes: `Encaixe preenchido automaticamente via Fila de Espera WhatsApp (${entry.notes || 'Sem observações'})`,
      },
      include: {
        patient: true,
      },
    });

    // Atualizar status na fila de espera para AGENDADO
    updateWaitlistEntry(entry.id, {
      status: 'AGENDADO',
    });

    return {
      success: true,
      appointment: newAppointment,
      message: `Agendamento criado com sucesso! A lacuna da agenda para ${entry.offeredSlot.dateDisplay} às ${entry.offeredSlot.timeDisplay} foi preenchida pelo paciente ${entry.patientName}.`,
    };
  } catch (error: any) {
    console.error('Erro ao confirmar agendamento da fila de espera:', error);
    return { success: false, message: `Erro ao criar agendamento: ${error.message}` };
  }
}

/**
 * Tratar recusa do horário pelo paciente da fila e passar para o próximo da fila
 */
export async function declineWaitlistSlot(waitlistId: string): Promise<{ success: boolean; nextNotified?: any }> {
  const list = loadWaitlist();
  const entry = list.find((i) => i.id === waitlistId);
  if (!entry) return { success: false };

  const offeredSlot = entry.offeredSlot;
  updateWaitlistEntry(waitlistId, { status: 'RECUSADO' });

  // Notificar o próximo da fila se havia um horário oferecido
  if (offeredSlot) {
    const nextResult = await notifyFirstInWaitlistForVacatedSlot({
      startTime: offeredSlot.startTime,
      endTime: offeredSlot.endTime,
    });
    return { success: true, nextNotified: nextResult };
  }

  return { success: true };
}
