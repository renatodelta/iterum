import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';

export interface AutomationLog {
  id: string;
  type:
    | 'AGENDAMENTO'
    | 'REMARCACAO'
    | 'CANCELAMENTO'
    | 'CONFIRMACAO_PRESENCA'
    | 'FILA_NOTIFICACAO'
    | 'FILA_RECUPERADA'
    | 'FILA_RECUSA';
  title: string;
  description: string;
  patientName: string;
  patientPhone: string;
  patientCpf?: string | null;
  appointmentDate?: string;
  slotTime?: string;
  details?: Record<string, any>;
  origin: 'WHATSAPP_SOFIA' | 'SISTEMA_AUTO' | 'FILA_ESPERA' | 'PAINEL';
  createdAt: string;
}

const LOGS_FILE_PATH = process.env.VERCEL
  ? path.join('/tmp', 'automation-logs.json')
  : path.join(process.cwd(), 'data', 'automation-logs.json');

function ensureDataDirectory() {
  const dir = path.dirname(LOGS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
  }
}

let inMemoryLogs: AutomationLog[] | null = null;

function loadLogsFromFile(): AutomationLog[] {
  ensureDataDirectory();
  try {
    if (fs.existsSync(LOGS_FILE_PATH)) {
      const content = fs.readFileSync(LOGS_FILE_PATH, 'utf-8');
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          inMemoryLogs = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ [AutomationLog] Erro ao ler arquivo:', err);
  }
  return inMemoryLogs || [];
}

function saveLogsToFile(logs: AutomationLog[]): void {
  inMemoryLogs = logs;
  ensureDataDirectory();
  try {
    fs.writeFileSync(LOGS_FILE_PATH, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (err) {
    console.warn('⚠️ [AutomationLog] Erro ao salvar arquivo:', err);
  }
}

/**
 * Registra um evento executado pela automação ou pela IA Sofia
 */
export async function logAutomationAction(
  data: Omit<AutomationLog, 'id' | 'createdAt'>
): Promise<AutomationLog> {
  const newLog: AutomationLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    ...data,
    createdAt: new Date().toISOString(),
  };

  const logs = loadLogsFromFile();
  // Adiciona no topo e limita aos últimos 200 registros
  logs.unshift(newLog);
  if (logs.length > 200) {
    logs.length = 200;
  }
  saveLogsToFile(logs);

  console.log(`📡 [Ações da Automação] [${newLog.type}] ${newLog.title} - ${newLog.patientName}`);
  return newLog;
}

/**
 * Retorna os logs da automação. Se estiver vazio na primeira execução,
 * sintetiza eventos a partir do histórico real do banco de dados para popular a tela.
 */
export async function getAutomationLogs(): Promise<AutomationLog[]> {
  const currentLogs = loadLogsFromFile();

  if (currentLogs.length > 0) {
    return currentLogs;
  }

  // População inicial inteligente baseada nas ações reais recentes do banco
  const synthesized: AutomationLog[] = [];
  try {
    const recentAppointments = await prisma.appointment.findMany({
      take: 15,
      orderBy: { updatedAt: 'desc' },
      include: { patient: true },
    });

    for (const appt of recentAppointments) {
      const dt = new Date(appt.startTime);
      const dateDisp = dt.toLocaleDateString('pt-BR');
      const timeDisp = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (appt.status === 'CANCELADO' || appt.status === 'CANCELED') {
        synthesized.push({
          id: `log-seed-${appt.id}`,
          type: 'CANCELAMENTO',
          title: 'Consulta Desmarcada',
          description: `Consulta de ${appt.patient.name} marcada para ${dateDisp} às ${timeDisp} foi desmarcada via WhatsApp.`,
          patientName: appt.patient.name,
          patientPhone: appt.patient.phone,
          patientCpf: appt.patient.cpf,
          appointmentDate: dateDisp,
          slotTime: timeDisp,
          origin: 'WHATSAPP_SOFIA',
          createdAt: appt.updatedAt ? appt.updatedAt.toISOString() : appt.createdAt.toISOString(),
        });
      } else if (appt.notes?.includes('Fila de Espera') || appt.notes?.includes('Encaixe')) {
        synthesized.push({
          id: `log-seed-${appt.id}`,
          type: 'FILA_RECUPERADA',
          title: 'Vaga Recuperada pela Fila de Espera',
          description: `A vaga de ${dateDisp} às ${timeDisp} foi ocupada automaticamente por ${appt.patient.name} via Fila de Espera WhatsApp.`,
          patientName: appt.patient.name,
          patientPhone: appt.patient.phone,
          patientCpf: appt.patient.cpf,
          appointmentDate: dateDisp,
          slotTime: timeDisp,
          origin: 'FILA_ESPERA',
          createdAt: appt.createdAt.toISOString(),
        });
      } else {
        synthesized.push({
          id: `log-seed-${appt.id}`,
          type: 'AGENDAMENTO',
          title: 'Agendamento Realizado',
          description: `Consulta agendada para ${appt.patient.name} em ${dateDisp} às ${timeDisp} via Sofia.`,
          patientName: appt.patient.name,
          patientPhone: appt.patient.phone,
          patientCpf: appt.patient.cpf,
          appointmentDate: dateDisp,
          slotTime: timeDisp,
          origin: 'WHATSAPP_SOFIA',
          createdAt: appt.createdAt.toISOString(),
        });
      }
    }

    // Buscar histórico recente da Fila de Espera
    const pAny = prisma as any;
    if (pAny.waitlist) {
      const waitlistItems = await pAny.waitlist.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' },
      });

      for (const w of waitlistItems) {
        if (w.status === 'NOTIFICADO' && w.offeredSlot) {
          try {
            const slot = typeof w.offeredSlot === 'string' ? JSON.parse(w.offeredSlot) : w.offeredSlot;
            synthesized.push({
              id: `log-seed-wait-${w.id}`,
              type: 'FILA_NOTIFICACAO',
              title: 'Vaga Ofertada para Fila de Espera',
              description: `Vaga de ${slot.dateDisplay} às ${slot.timeDisplay} ofertada prioritariamente para ${w.patientName} via WhatsApp.`,
              patientName: w.patientName,
              patientPhone: w.patientPhone,
              appointmentDate: slot.dateDisplay,
              slotTime: slot.timeDisplay,
              origin: 'FILA_ESPERA',
              createdAt: w.notifiedAt ? w.notifiedAt.toISOString() : w.updatedAt.toISOString(),
            });
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ [AutomationLog] Falha ao sintetizar registros iniciais:', e);
  }

  // Ordenar por data mais recente primeiro
  synthesized.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (synthesized.length > 0) {
    saveLogsToFile(synthesized);
    return synthesized;
  }

  return [];
}

/**
 * Limpa todos os logs da automação
 */
export async function clearAutomationLogs(): Promise<void> {
  inMemoryLogs = [];
  saveLogsToFile([]);
}
