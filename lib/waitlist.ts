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

function loadWaitlistFromFile(): WaitlistEntry[] {
  ensureDataDirectory();
  try {
    if (fs.existsSync(WAITLIST_FILE_PATH)) {
      const data = fs.readFileSync(WAITLIST_FILE_PATH, 'utf-8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          inMemoryWaitlist = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ [Waitlist] Erro ao ler arquivo:', err);
  }
  return inMemoryWaitlist || [];
}

function syncToLocalFile(entry: WaitlistEntry): void {
  const list = loadWaitlistFromFile();
  const idx = list.findIndex((i) => i.id === entry.id || i.patientPhone.replace(/\D/g, '').slice(-8) === entry.patientPhone.replace(/\D/g, '').slice(-8));
  if (idx >= 0) {
    list[idx] = entry;
  } else {
    list.push(entry);
  }
  saveWaitlist(list);
}

/**
 * Carrega a fila de espera com prioridade absoluta para o banco de dados PostgreSQL (Prisma).
 * Se o banco estiver indisponível, usa o fallback local do arquivo.
 */
export async function loadWaitlist(): Promise<WaitlistEntry[]> {
  try {
    const pAny = prisma as any;
    if (pAny.waitlist) {
      const dbList = await pAny.waitlist.findMany({
        orderBy: { createdAt: 'asc' },
      });
      if (Array.isArray(dbList)) {
        const mapped: WaitlistEntry[] = dbList.map((r: any) => ({
          id: r.id,
          patientId: r.patientId || undefined,
          patientName: r.patientName,
          patientPhone: r.patientPhone,
          preferredShift: r.preferredShift || 'Qualquer Horário',
          preferredDays: r.preferredDays || 'Qualquer dia útil',
          status: r.status,
          notes: r.notes || undefined,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
          notifiedAt: r.notifiedAt ? (r.notifiedAt instanceof Date ? r.notifiedAt.toISOString() : r.notifiedAt) : null,
          offeredSlot: r.offeredSlot ? (typeof r.offeredSlot === 'string' ? JSON.parse(r.offeredSlot) : r.offeredSlot) : null,
        }));
        inMemoryWaitlist = mapped;
        saveWaitlist(mapped);
        return mapped;
      }
    }
  } catch (err) {
    console.warn('⚠️ [Waitlist] Banco Prisma inacessível, lendo do arquivo local:', err);
  }
  return loadWaitlistFromFile();
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
 * Zera completamente a fila de espera (no banco e no arquivo)
 */
export async function clearWaitlist(): Promise<void> {
  try {
    const pAny = prisma as any;
    if (pAny.waitlist) {
      await pAny.waitlist.deleteMany({});
    }
  } catch (err) {
    console.warn('⚠️ [Waitlist] Falha ao zerar fila no banco:', err);
  }
  inMemoryWaitlist = [];
  saveWaitlist([]);
}

/**
 * Adicionar paciente à fila de espera (Persistência no banco PostgreSQL + fallback)
 */
export async function addToWaitlist(data: {
  patientId?: string;
  patientName: string;
  patientPhone: string;
  preferredShift?: 'Manhã' | 'Tarde' | 'Qualquer Horário';
  preferredDays?: string;
  notes?: string;
}): Promise<WaitlistEntry> {
  const cleanPhone = data.patientPhone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`;
  const pAny = prisma as any;

  // 1. Tentar salvar no banco de dados Prisma (PostgreSQL / Vercel)
  try {
    let clinic = await prisma.clinic.findFirst();
    if (clinic && pAny.waitlist) {
      let dbPatient = await prisma.patient.findFirst({
        where: { clinicId: clinic.id, phone: { contains: cleanPhone.slice(-8) } },
      });
      if (!dbPatient) {
        dbPatient = await prisma.patient.create({
          data: {
            clinicId: clinic.id,
            name: data.patientName,
            phone: formattedPhone,
          },
        });
      }

      // Se já existir na fila com status AGUARDANDO ou NOTIFICADO, atualizar
      const existingInDb = await pAny.waitlist.findFirst({
        where: {
          clinicId: clinic.id,
          patientPhone: { contains: cleanPhone.slice(-8) },
          status: { in: ['AGUARDANDO', 'NOTIFICADO'] },
        },
      });

      if (existingInDb) {
        const updated = await pAny.waitlist.update({
          where: { id: existingInDb.id },
          data: {
            patientName: data.patientName || existingInDb.patientName,
            preferredShift: data.preferredShift || existingInDb.preferredShift,
            preferredDays: data.preferredDays || existingInDb.preferredDays,
            notes: data.notes || existingInDb.notes,
          },
        });
        const mappedEntry: WaitlistEntry = {
          id: updated.id,
          patientId: updated.patientId || dbPatient?.id,
          patientName: updated.patientName,
          patientPhone: updated.patientPhone,
          preferredShift: updated.preferredShift,
          preferredDays: updated.preferredDays,
          status: updated.status,
          notes: updated.notes,
          createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
          notifiedAt: updated.notifiedAt ? updated.notifiedAt.toISOString() : null,
          offeredSlot: updated.offeredSlot ? JSON.parse(updated.offeredSlot) : null,
        };
        syncToLocalFile(mappedEntry);
        return mappedEntry;
      }

      const created = await pAny.waitlist.create({
        data: {
          clinicId: clinic.id,
          patientId: dbPatient?.id || data.patientId,
          patientName: data.patientName.trim(),
          patientPhone: formattedPhone,
          preferredShift: data.preferredShift || 'Qualquer Horário',
          preferredDays: data.preferredDays || 'Qualquer dia útil',
          status: 'AGUARDANDO',
          notes: data.notes || 'Cadastrado na Fila de Espera',
        },
      });

      const mappedEntry: WaitlistEntry = {
        id: created.id,
        patientId: created.patientId || dbPatient?.id,
        patientName: created.patientName,
        patientPhone: created.patientPhone,
        preferredShift: created.preferredShift,
        preferredDays: created.preferredDays,
        status: created.status,
        notes: created.notes,
        createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : created.createdAt,
        notifiedAt: null,
        offeredSlot: null,
      };
      syncToLocalFile(mappedEntry);
      return mappedEntry;
    }
  } catch (dbErr) {
    console.warn('⚠️ [Waitlist] Erro ao salvar no banco Prisma, usando fallback:', dbErr);
  }

  // 2. Fallback de arquivo / memória
  const list = loadWaitlistFromFile();
  const existingIndex = list.findIndex(
    (item) => item.patientPhone.replace(/\D/g, '').slice(-8) === cleanPhone.slice(-8) && (item.status === 'AGUARDANDO' || item.status === 'NOTIFICADO')
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
 * Atualizar status de um item da fila (Banco + fallback)
 */
export async function updateWaitlistEntry(id: string, updates: Partial<WaitlistEntry>): Promise<WaitlistEntry | null> {
  const pAny = prisma as any;
  try {
    if (pAny.waitlist) {
      const dbEntry = await pAny.waitlist.findUnique({ where: { id } });
      if (dbEntry) {
        const updated = await pAny.waitlist.update({
          where: { id },
          data: {
            ...(updates.status ? { status: updates.status } : {}),
            ...(updates.patientName ? { patientName: updates.patientName } : {}),
            ...(updates.preferredShift ? { preferredShift: updates.preferredShift } : {}),
            ...(updates.preferredDays ? { preferredDays: updates.preferredDays } : {}),
            ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
            ...(updates.notifiedAt !== undefined ? { notifiedAt: updates.notifiedAt ? new Date(updates.notifiedAt) : null } : {}),
            ...(updates.offeredSlot !== undefined ? { offeredSlot: updates.offeredSlot ? JSON.stringify(updates.offeredSlot) : null } : {}),
          },
        });
        const mapped: WaitlistEntry = {
          id: updated.id,
          patientId: updated.patientId,
          patientName: updated.patientName,
          patientPhone: updated.patientPhone,
          preferredShift: updated.preferredShift,
          preferredDays: updated.preferredDays,
          status: updated.status,
          notes: updated.notes,
          createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
          notifiedAt: updated.notifiedAt ? updated.notifiedAt.toISOString() : null,
          offeredSlot: updated.offeredSlot ? (typeof updated.offeredSlot === 'string' ? JSON.parse(updated.offeredSlot) : updated.offeredSlot) : null,
        };
        syncToLocalFile(mapped);
        return mapped;
      }
    }
  } catch (err) {
    console.warn('⚠️ [Waitlist] Erro ao atualizar no banco, usando fallback:', err);
  }

  const list = loadWaitlistFromFile();
  const index = list.findIndex((i) => i.id === id);
  if (index === -1) return null;
  list[index] = { ...list[index], ...updates };
  saveWaitlist(list);
  return list[index];
}

/**
 * Remover da fila (Banco + fallback)
 */
export async function removeFromWaitlist(id: string): Promise<boolean> {
  const pAny = prisma as any;
  try {
    if (pAny.waitlist) {
      await pAny.waitlist.delete({ where: { id } });
    }
  } catch (err) {
    // ignore
  }
  const list = loadWaitlistFromFile();
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
  const list = await loadWaitlist();

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

  // Atualizar paciente na fila como NOTIFICADO (Banco + Fallback)
  const updatedEntry = await updateWaitlistEntry(patient.id, {
    status: 'NOTIFICADO',
    notifiedAt: new Date().toISOString(),
    offeredSlot,
  });

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
    patient: updatedEntry || list[targetIndex],
    message: `1º paciente da Fila de Espera (${patient.patientName}) contactado via WhatsApp para o horário ${dateDisplay} às ${timeDisplay}.`,
    whatsappResult,
  };
}

/**
 * Confirmar agendamento do paciente da fila e preencher a lacuna da agenda
 */
export async function confirmWaitlistBooking(
  waitlistId: string,
  clinicId?: string,
  fallbackSlot?: {
    startTime: string;
    endTime?: string;
    dateDisplay?: string;
    timeDisplay?: string;
  }
): Promise<{ success: boolean; appointment?: any; message: string }> {
  const list = await loadWaitlist();
  const cleanId = (waitlistId || '').replace(/\D/g, '');
  let entry = list.find((i) => i.id === waitlistId);
  if (!entry && cleanId) {
    const last8 = cleanId.slice(-8);
    entry = list.find((i) => i.patientPhone.replace(/\D/g, '').slice(-8) === last8);
  }

  const slot = entry?.offeredSlot || fallbackSlot;
  if (!slot || !slot.startTime) {
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
    const phoneToSearch = entry?.patientPhone || waitlistId;
    let patient = await prisma.patient.findFirst({
      where: {
        clinicId: clinic.id,
        phone: { contains: phoneToSearch.replace(/\D/g, '').slice(-8) },
      },
    });

    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          clinicId: clinic.id,
          name: entry?.patientName || 'Paciente Fila de Espera',
          phone: phoneToSearch,
        },
      });
    }

    const start = new Date(slot.startTime);
    const end = slot.endTime ? new Date(slot.endTime) : new Date(start.getTime() + (clinic.slotDurationMinutes || 30) * 60000);

    // Criar o agendamento preenchendo a lacuna
    const newAppointment = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        startTime: start,
        endTime: end,
        status: 'CONFIRMADO',
        notes: `Encaixe preenchido automaticamente via Fila de Espera WhatsApp (${entry?.notes || 'Vaga recuperada'})`,
      },
      include: {
        patient: true,
      },
    });

    // Atualizar status na fila de espera para AGENDADO
    if (entry) {
      await updateWaitlistEntry(entry.id, {
        status: 'AGENDADO',
      });
    }

    const dateDisp = slot.dateDisplay || start.toLocaleDateString('pt-BR');
    const timeDisp = slot.timeDisplay || start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    return {
      success: true,
      appointment: newAppointment,
      message: `Agendamento criado com sucesso! A lacuna da agenda para ${dateDisp} às ${timeDisp} foi preenchida pelo paciente ${patient.name}.`,
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
  const list = await loadWaitlist();
  const entry = list.find((i) => i.id === waitlistId);
  if (!entry) return { success: false };

  const offeredSlot = entry.offeredSlot;
  await updateWaitlistEntry(waitlistId, { status: 'RECUSADO' });

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
