import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import {
  addToWaitlist,
  loadWaitlist,
  confirmWaitlistBooking,
  declineWaitlistSlot,
  updateWaitlistEntry,
} from '@/lib/waitlist';
import {
  buscarConsultaAtual,
  buscarHorariosDisponiveis,
  buscarProximosHorariosDisponiveis,
  cancelarConsulta,
  confirmarRemarcacao,
  criarNovoAgendamento,
  formatBRT,
  formatBRTShort,
  parseBRT,
  verificarAgendaTemHorariosDisponiveis,
} from './tools';

/**
 * Obtém os dados e nome da médica e o link institucional da clínica
 */
export async function getDoctorInfo(clinicId?: string): Promise<{ name: string; link: string }> {
  try {
    const doctor = await prisma.user.findFirst({
      where: { role: 'MEDICO', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (doctor?.name) {
      const name = doctor.name.startsWith('Dr') ? doctor.name : `Dra. ${doctor.name}`;
      return {
        name,
        link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
      };
    }
    if (clinicId) {
      const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
      if (clinic?.name?.includes('Dr')) {
        return {
          name: clinic.name,
          link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
        };
      }
    }
  } catch (e) {}

  return {
    name: 'Dra. Mariana Souza',
    link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
  };
}

export const SYSTEM_PROMPT = `Você é a assistente virtual inteligente de atendimento e gestão de consultas do consultório médico Iterum.

MANUAL OPERACIONAL PADRONIZADO (POP) - FLUXO DE ATENDIMENTO E AGENDAMENTO VIA WHATSAPP (1º CONTATO):
Você deve seguir estritamente a árvore de decisão condicional e os scripts do POP:

1. **MENSAGEM DE BOAS-VINDAS E TRIAGEM INICIAL (M-01):**
   - Para primeiro contato ou início de atendimento:
   "Olá [Nome da Pessoa], seja bem-vindo(a) ao consultório da Dra. [Nome da Médica]. Esse é um canal exclusivo para agendamentos, reagendamentos e remarcações.

   Você deseja agendar uma consulta?

   [1] SIM
   [2] NÃO"

2. **FLUXO A - AGENDAMENTO DE CONSULTA (RESPOSTA: SIM):**
   - **Etapa A.1: Identificação do Titular do Atendimento (M-02):**
     "O atendimento é para você mesmo?

     [1] SIM
     [2] NÃO"
   - Se o paciente responder SIM:
     Avança diretamente para a Etapa A.2.
   - Se o paciente responder NÃO:
     1. Solicita (M-03): "Informe o nome da pessoa para a qual deseja atendimento."
     2. Ao receber o nome, confirma (M-04): "Gostaria de atendimento para o(a) Sr.(a) [Nome do Paciente]?

     [1] SIM
     [2] NÃO"
     - Se SIM: Avança para a Etapa A.2 com o nome do titular confirmado.
     - Se NÃO: Retorna para M-03 solicitando o nome novamente.

3. **ETAPA A.2 (ENVIO DO LINK DA AGENDA DIGITAL - 4 MESES):**
   - Texto exato de A.2:
     "[Nome], para agilizar seu atendimento você pode acessar os horários disponíveis de forma rápida e prática clicando no link abaixo:
     [Link da página de agendamento]"
   - O link direciona para a página /agendamento com a grade de horários disponíveis dos próximos 4 meses, com confirmação em pop-up e envio automático de mensagem de confirmação para o WhatsApp do paciente.

4. **ETAPAS A.3 a A.5 - ESCOLHA E CONFIRMAÇÃO DO HORÁRIO:**
   - Ao receber o horário desejado pelo paciente, valide a disponibilidade.
   - Solicite a confirmação final (Etapa A.5):
     "Você confirma o agendamento em [Data (DD/MM/AAAA)] às [Horário (HH:mm)]?

     [1] SIM
     [2] NÃO"
   - Ao receber [SIM]:
     Invoque a ferramenta criar_novo_agendamento para cadastrar a consulta e responda com a mensagem final (M-09):
     "Agendamento confirmado com sucesso!

     Dra. [Nome da Médica] agradece o contato e deseja um ótimo dia!"
   - Ao receber [NÃO]:
     "Sem problemas! O agendamento não foi realizado. Qual outra data ou horário você prefere?"

5. **FLUXO B - INFORMAÇÕES INSTITUCIONAIS E RETENÇÃO (RESPOSTA: NÃO NO M-01):**
   - Pergunta institucional (M-06):
     "Deseja conhecer um pouco mais sobre a Dra. [Nome da Médica]?

     [1] SIM
     [2] NÃO"
   - Se o paciente responder SIM (M-07):
     "É com imensa satisfação que recebemos você aqui pela 1ª vez. Para conhecer um pouco mais sobre a Dra. [Nome da Médica], clique no link abaixo: [Link]"
   - Se o paciente responder NÃO (M-08):
     "Esse é um canal exclusivo para agendamentos, reagendamentos ou remarcações. Esperamos vê-lo(a) aqui novamente em breve."

6. **RECOMENDAÇÕES TÉCNICAS E REGRAS OPERACIONAIS:**
   - **Transbordo para Atendente Humano:** Palavras-chave de escape como 'falar com secretária', 'atendente', 'ajuda', 'falar com alguém' ativam a transferência imediata:
     "Com certeza! Estou transferindo seu atendimento para nossa equipe da recepção. Um momento, por favor, que uma de nossas secretárias já irá lhe atender."
   - **Tratamento de Erros:** Caso o paciente digite texto inválido onde se espera [SIM/NÃO], reenvie amigavelmente a pergunta.
   - **Remarcações e Cancelamentos:** Caso o paciente mencione querer remarcar ou cancelar consulta existente, atenda com as ferramentas correspondentes.
   - **Formatação para WhatsApp:** Use negritos em *datas* e *horários*, emojis moderados e mensagens limpas.`;

// Definição das ferramentas no formato OpenAI JSON Schema
const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'buscar_consulta_atual',
      description: 'Localiza a consulta futura mais próxima agendada para o paciente pelo seu número de telefone.',
      parameters: {
        type: 'object',
        properties: {
          telefone_paciente: {
            type: 'string',
            description: 'Telefone do paciente com DDD (ex: 11999991111).',
          },
        },
        required: ['telefone_paciente'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_proximos_horarios_disponiveis',
      description: 'Consulta os próximos dias e horários livres disponíveis na grade da clínica para listar diretamente no WhatsApp na Etapa A.2.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_horarios_disponiveis',
      description: 'Consulta a grade de horários livres para uma data específica informada pelo paciente.',
      parameters: {
        type: 'object',
        properties: {
          data_desejada: {
            type: 'string',
            description: 'Data desejada no formato DD/MM/AA ou AAAA-MM-DD.',
          },
          periodo: {
            type: 'string',
            enum: ['manha', 'tarde', 'noite', 'qualquer'],
            description: 'Período do dia preferido pelo paciente.',
          },
        },
        required: ['data_desejada'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_novo_agendamento',
      description: 'Efetiva um novo agendamento de consulta na clínica após a confirmação do paciente na Etapa A.5.',
      parameters: {
        type: 'object',
        properties: {
          nova_data_hora: {
            type: 'string',
            description: 'Data e horário da consulta no formato AAAA-MM-DD HH:mm (ex: 2026-10-14 09:00).',
          },
          beneficiario_nome: {
            type: 'string',
            description: 'Nome da pessoa que receberá o atendimento médico.',
          },
        },
        required: ['nova_data_hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_consulta',
      description: 'Cancela um agendamento existente respeitando o prazo mínimo de antecedência.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: {
            type: 'string',
            description: 'ID do agendamento a ser cancelado.',
          },
          motivo: {
            type: 'string',
            description: 'Motivo informado pelo paciente para o cancelamento.',
          },
        },
        required: ['agendamento_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_remarcacao',
      description: 'Efetiva a remarcação de um agendamento criando um novo registro e alterando o antigo.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: {
            type: 'string',
            description: 'ID do agendamento atual a ser remarcado.',
          },
          nova_data_hora: {
            type: 'string',
            description: 'Nova data e horário no formato AAAA-MM-DD HH:mm (ex: 2026-09-25 14:30).',
          },
        },
        required: ['agendamento_id', 'nova_data_hora'],
      },
    },
  },
];

/**
 * Executa uma Tool chamada pela IA
 */
async function executeToolCall(toolName: string, toolArgs: any, clinicId?: string, patientId?: string) {
  console.log(`🤖 Executando ferramenta IA [${toolName}] com argumentos:`, toolArgs);
  switch (toolName) {
    case 'buscar_consulta_atual':
      return await buscarConsultaAtual(toolArgs.telefone_paciente, clinicId);
    case 'buscar_proximos_horarios_disponiveis':
      return await buscarProximosHorariosDisponiveis(clinicId, 2);
    case 'buscar_horarios_disponiveis':
      return await buscarHorariosDisponiveis(toolArgs.data_desejada, toolArgs.periodo, clinicId);
    case 'criar_novo_agendamento':
      return await criarNovoAgendamento(patientId || '', toolArgs.nova_data_hora, clinicId, toolArgs.beneficiario_nome);
    case 'cancelar_consulta':
      return await cancelarConsulta(toolArgs.agendamento_id, toolArgs.motivo);
    case 'confirmar_remarcacao':
      return await confirmarRemarcacao(toolArgs.agendamento_id, toolArgs.nova_data_hora);
    default:
      return { success: false, message: `Ferramenta desconhecida: ${toolName}` };
  }
}

export interface ProcessMessageOptions {
  patientPhone: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }>;
  clinicId?: string;
  pushName?: string;
}

export interface AgentProcessResult {
  reply: string;
  toolsExecuted: Array<{ name: string; args: any; result: any }>;
}

/**
 * Helper para verificar se mensagem é afirmativa (SIM / 1)
 */
function isYes(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t === '1' ||
    t === 'sim' ||
    t === 's' ||
    t === 'quero' ||
    t === 'com certeza' ||
    t === 'positivo' ||
    t.startsWith('1 -') ||
    t.startsWith('1.') ||
    t.startsWith('[1]') ||
    t === 'ok' ||
    t === 'claro' ||
    t.startsWith('sim') ||
    t.includes('tenho interesse') ||
    t.includes('btn_waitlist_sim') ||
    t.includes('confirmar') ||
    t.includes('pode confirmar') ||
    t.includes('pode agendar') ||
    t.includes('tenho sim')
  );
}

/**
 * Helper para verificar se mensagem é negativa (NÃO / 2)
 */
function isNo(text: string): boolean {
  const t = text.toLowerCase().trim();
  return (
    t === '2' ||
    t === 'não' ||
    t === 'nao' ||
    t === 'n' ||
    t === 'negativo' ||
    t.startsWith('2 -') ||
    t.startsWith('2.') ||
    t.startsWith('[2]') ||
    t.startsWith('não') ||
    t.startsWith('nao') ||
    t.includes('btn_waitlist_nao') ||
    t.includes('não tenho interesse') ||
    t.includes('nao tenho interesse') ||
    t.includes('passar a vez') ||
    t.includes('dispensar') ||
    t.includes('cancelar')
  );
}

/**
 * Limpa e formata o nome digitado pelo paciente para terceiros
 */
function sanitizePersonName(text: string): string {
  let name = text
    .replace(/^(é\s+para\s+|e\s+para\s+|para\s+|seria\s+|o\s+|a\s+|meu\s+filho\s+|minha\s+mãe\s+|meu\s+marido\s+|minha\s+esposa\s+)/i, '')
    .replace(/[.!?]/g, '')
    .trim();

  if (!name) return 'Paciente';

  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extrai horário (HH:mm) do texto
 */
function extractTimeFromText(text: string): string | null {
  const match = text.match(/\b(\d{1,2})[:h](\d{2})?\b|\b(\d{1,2})h\b/i);
  if (match) {
    let hour = parseInt(match[1] || match[3], 10);
    let min = match[2] ? parseInt(match[2], 10) : 0;
    if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Extrai datas no formato DD/MM/AA, DD/MM/AAAA ou termos amigáveis (hoje, amanhã, dia da semana)
 */
function extractDateFromText(text: string): { dateStr: string; formattedStr: string } | null {
  const msgLower = text.toLowerCase().trim();
  const today = new Date();

  // 1. Match DD/MM/YY ou DD/MM/YYYY ou DD/MM
  const dateMatch = msgLower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : today.getFullYear();
    if (year < 100) year += 2000;

    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      const dateISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const formatted = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      return { dateStr: dateISO, formattedStr: formatted };
    }
  }

  // 2. Match por extenso tipo "25 de setembro de 2026" ou "25 de setembro"
  const extensoMatch = msgLower.match(/\b(\d{1,2})\s+de\s+([a-zçáéíóú]+)(?:\s+de\s+(\d{4}))?\b/i);
  if (extensoMatch) {
    const day = parseInt(extensoMatch[1], 10);
    const monthStr = extensoMatch[2].toLowerCase();
    let year = extensoMatch[3] ? parseInt(extensoMatch[3], 10) : today.getFullYear();
    const monthsMap: Record<string, number> = {
      janeiro: 0, fevereiro: 1, marco: 2, março: 2, abril: 3, maio: 4, junho: 5,
      julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
    };
    if (monthsMap[monthStr] !== undefined) {
      const d = new Date(year, monthsMap[monthStr], day);
      if (!isNaN(d.getTime())) {
        const dateISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const formatted = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        return { dateStr: dateISO, formattedStr: formatted };
      }
    }
  }

  if (msgLower.includes('hoje')) {
    const dateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { dateStr: dateISO, formattedStr: 'Hoje' };
  }

  if (msgLower.includes('amanhã') || msgLower.includes('amanha')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    return { dateStr: dateISO, formattedStr: 'Amanhã' };
  }

  const weekDaysMap: Record<string, number> = {
    'domingo': 0,
    'segunda': 1,
    'terça': 2,
    'terca': 2,
    'quarta': 3,
    'quinta': 4,
    'sexta': 5,
    'sábado': 6,
    'sabado': 6,
  };

  for (const [dayName, dayNum] of Object.entries(weekDaysMap)) {
    if (msgLower.includes(dayName)) {
      const target = new Date(today);
      let diff = (dayNum + 7 - today.getDay()) % 7;
      if (diff === 0) diff = 7;
      target.setDate(today.getDate() + diff);
      const dateISO = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
      return { dateStr: dateISO, formattedStr: target.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) };
    }
  }

  return null;
}

/**
 * MOTOR DO FLUXO DO POP (Procedimento Operacional Padrão)
 * Executa de forma consistente, determinística e rigorosa todas as etapas M-01 a M-09.
 */
async function runPOPWorkflow(
  patientPhone: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  clinicId?: string,
  patientName: string = 'Paciente',
  patientId?: string,
  pushName?: string
): Promise<AgentProcessResult | null> {
  const toolsExecuted: Array<{ name: string; args: any; result: any }> = [];
  const msgLower = userMessage.toLowerCase().trim();
  const doctorInfo = await getDoctorInfo(clinicId);

  // 1. TRANSBORDO PARA ATENDENTE HUMANO (ESCAPE UNIVERSAL)
  const isHumanTransfer =
    msgLower.includes('secretaria') ||
    msgLower.includes('secretária') ||
    msgLower.includes('atendente') ||
    msgLower.includes('humano') ||
    msgLower.includes('humana') ||
    msgLower.includes('falar com alguém') ||
    msgLower.includes('falar com alguem') ||
    msgLower === 'ajuda';

  if (isHumanTransfer) {
    return {
      reply: 'Com certeza! Estou transferindo seu atendimento para nossa equipe da recepção. Um momento, por favor, que uma de nossas secretárias já irá lhe atender.',
      toolsExecuted,
    };
  }

  // 2. Localizar a última mensagem enviada pelo assistente (se houver)
  const assistantMessages = history.filter((m) => m.role === 'assistant');
  const lastAssistantMsg = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';

  // Determinar o nome do titular do WhatsApp (quem está conversando no momento)
  const effectiveName = (pushName && pushName !== 'Paciente') ? pushName : patientName;
  const displayName = effectiveName && effectiveName !== 'Paciente' ? effectiveName.split(' ')[0] : '';
  const greetingName = displayName ? `${displayName}, ` : '';

  // 3. RECUPERAR BENEFICIÁRIO (somente se nesta sessão recente houve confirmação de terceiro em M-04)
  let currentBeneficiary = displayName || patientName;
  let sessionStartIndex = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const content = history[i].content || '';
    if (content.includes('agradece o contato e deseja um ótimo dia') || content.includes('Esperamos vê-lo(a) aqui novamente em breve')) {
      sessionStartIndex = i + 1;
      break;
    }
  }

  for (let i = history.length - 1; i >= sessionStartIndex; i--) {
    const m = history[i];
    if (m.role === 'assistant') {
      const match = m.content.match(/Sr\.\(a\)\s+([^?\n]+)/i);
      if (match) {
        currentBeneficiary = match[1].trim();
        break;
      }
    }
  }

  // =========================================================================
  // ETAPA FILA DE ESPERA 1: OFERTA DE VAGA LIBERADA POR REMARCAÇÃO / CANCELAMENTO
  // Pergunta anterior: "Você tem interesse em agendar neste horário?"
  // =========================================================================
  const waitlist = loadWaitlist();
  const phoneDigits = patientPhone.replace(/\D/g, '');
  const last8 = phoneDigits.slice(-8);
  const notifiedEntry = waitlist.find(
    (w) =>
      (w.patientPhone.replace(/\D/g, '').slice(-8) === last8 ||
       w.patientPhone.replace(/\D/g, '') === phoneDigits) &&
      w.status === 'NOTIFICADO'
  );

  const isWaitlistOfferContext =
    lastAssistantMsg.includes('Você tem interesse em agendar neste horário?') ||
    lastAssistantMsg.includes('Você tem interesse nesse horário?') ||
    lastAssistantMsg.includes('este horário foi reservado com prioridade para você') ||
    Boolean(notifiedEntry && (isYes(userMessage) || isNo(userMessage)));

  if (isWaitlistOfferContext) {
    const entry =
      notifiedEntry ||
      waitlist.find(
        (w) =>
          (w.patientPhone.replace(/\D/g, '').slice(-8) === last8 ||
           w.patientPhone.replace(/\D/g, '') === phoneDigits) &&
          (w.status === 'NOTIFICADO' || w.status === 'AGUARDANDO')
      );

    if (isYes(userMessage)) {
      // 1. Tentar obter o horário ofertado do entry ou reconstruir a partir da mensagem no histórico
      let slotData = entry?.offeredSlot;
      if (!slotData) {
        for (let i = history.length - 1; i >= 0; i--) {
          const text = history[i].content || '';
          const dMatch = text.match(/Data:\s*\*([^*]+)\*/i);
          const tMatch = text.match(/Horário:\s*\*([^*]+)\*/i);
          if (dMatch && tMatch) {
            const datePart = dMatch[1].trim();
            const timePart = tMatch[1].trim();
            const timeParts = timePart.includes('às') ? timePart.split('às').map((s) => s.trim()) : [timePart, timePart];
            const dParts = datePart.split('/');
            if (dParts.length === 3) {
              const isoDate = `${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
              const startIso = parseBRT(`${isoDate}T${timeParts[0]}:00`).toISOString();
              const endIso = timeParts[1] ? parseBRT(`${isoDate}T${timeParts[1]}:00`).toISOString() : undefined;
              slotData = {
                startTime: startIso,
                endTime: endIso,
                dateDisplay: datePart,
                timeDisplay: timePart,
              };
              if (entry) {
                entry.offeredSlot = slotData;
                updateWaitlistEntry(entry.id, { offeredSlot: slotData });
              }
              break;
            }
          }
        }
      }

      // Paciente tem interesse! Resumir o agendamento e pedir confirmação final
      let slotDisplay = 'horário liberado';
      if (slotData) {
        slotDisplay = slotData.timeDisplay.includes('às')
          ? `${slotData.dateDisplay} das ${slotData.timeDisplay}`
          : `${slotData.dateDisplay} às ${slotData.timeDisplay}`;
      }
      const patientTargetName = entry?.patientName || displayName || 'Paciente';

      return {
        reply: `Excelente, ${displayName || patientTargetName}! Resumo do seu agendamento para a vaga liberada:\n\n👤 *Paciente:* ${patientTargetName}\n📅 *Data e Horário:* ${slotDisplay}\n👨‍⚕️ *Profissional:* ${doctorInfo.name}\n\nPodemos confirmar o seu agendamento para preencher este horário?\n\n[1] SIM, confirmar agendamento\n[2] NÃO`,
        toolsExecuted,
      };
    } else if (isNo(userMessage)) {
      // Paciente não tem interesse: marcar como RECUSADO e notificar próximo da fila
      if (entry) {
        await declineWaitlistSlot(entry.id);
      }
      return {
        reply: `Entendido, ${greetingName}! Registramos sua resposta e a vaga será oferecida ao próximo paciente da fila. Continuaremos avisando você caso surja uma nova vaga em outro dia!`,
        toolsExecuted,
      };
    } else {
      return {
        reply: `Por favor, responda com [1] SIM caso tenha interesse no horário liberado ou [2] NÃO para passar a vez.`,
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA FILA DE ESPERA 2: CONFIRMAÇÃO FINAL DO ENCAIXE & PREENCHIMENTO DA LACUNA
  // Pergunta anterior: "Podemos confirmar o seu agendamento para preencher este horário?"
  // =========================================================================
  const isWaitlistConfirmationContext =
    lastAssistantMsg.includes('Podemos confirmar o seu agendamento para preencher este horário?') ||
    lastAssistantMsg.includes('Resumo do seu agendamento para a vaga liberada');

  if (isWaitlistConfirmationContext) {
    const entry = waitlist.find(
      (w) =>
        (w.patientPhone.replace(/\D/g, '').slice(-8) === last8 ||
         w.patientPhone.replace(/\D/g, '') === phoneDigits) &&
        (w.status === 'NOTIFICADO' || w.status === 'AGUARDANDO')
    );

    // Reconstruir slotData caso não esteja presente no entry
    let slotData = entry?.offeredSlot;
    if (!slotData) {
      for (let i = history.length - 1; i >= 0; i--) {
        const text = history[i].content || '';
        const dMatch = text.match(/Data:\s*\*([^*]+)\*/i) || text.match(/Data e Horário:\s*([^\n]+)/i);
        const tMatch = text.match(/Horário:\s*\*([^*]+)\*/i);
        if (dMatch && tMatch) {
          const datePart = dMatch[1].trim();
          const timePart = tMatch[1].trim();
          const timeParts = timePart.includes('às') ? timePart.split('às').map((s) => s.trim()) : [timePart, timePart];
          const dParts = datePart.split('/');
          if (dParts.length === 3) {
            const isoDate = `${dParts[2]}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
            const startIso = parseBRT(`${isoDate}T${timeParts[0]}:00`).toISOString();
            const endIso = timeParts[1] ? parseBRT(`${isoDate}T${timeParts[1]}:00`).toISOString() : undefined;
            slotData = {
              startTime: startIso,
              endTime: endIso,
              dateDisplay: datePart,
              timeDisplay: timePart,
            };
            if (entry) {
              entry.offeredSlot = slotData;
              updateWaitlistEntry(entry.id, { offeredSlot: slotData });
            }
            break;
          }
        }
      }
    }

    if (isYes(userMessage)) {
      const bookRes = await confirmWaitlistBooking(entry?.id || patientPhone, clinicId, slotData || undefined);
      toolsExecuted.push({ name: 'confirmar_encaixe_fila', args: { waitlistId: entry?.id || patientPhone }, result: bookRes });

      if (bookRes.success) {
        let slotDisplay = 'horário combinado';
        if (slotData) {
          slotDisplay = slotData.timeDisplay.includes('às')
            ? `${slotData.dateDisplay} das ${slotData.timeDisplay}`
            : `${slotData.dateDisplay} às ${slotData.timeDisplay}`;
        }
        return {
          reply: `🎉 Agendamento confirmado com sucesso!\n\nA vaga foi garantida e a lacuna da agenda foi preenchida. Sua consulta está marcada para o dia *${slotDisplay}* com ${doctorInfo.name}.\n\nAgradecemos a sua confirmação e esperamos você!`,
          toolsExecuted,
        };
      } else {
        console.error('❌ Falha ao confirmar agendamento da fila:', bookRes.message);
        return {
          reply: `Tivemos uma instabilidade ao confirmar a vaga na agenda (${bookRes.message}). Por favor, tente novamente ou fale com a nossa recepção.`,
          toolsExecuted,
        };
      }
    } else if (isNo(userMessage)) {
      if (entry) {
        await declineWaitlistSlot(entry.id);
      }
      return {
        reply: 'Sem problemas! O agendamento não foi concluído e você continuará em nossa lista para oportunidades futuras.',
        toolsExecuted,
      };
    } else {
      return {
        reply: 'Por favor, responda com [1] SIM para confirmar o agendamento da vaga ou [2] NÃO para cancelar.',
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA FILA DE ESPERA 3: RESPOSTA SOBRE ENTRAR NA FILA DE ESPERA
  // Pergunta anterior: "Gostaria de entrar na nossa *Fila de Espera*?" ou "Gostaria de ficar na nossa *Fila de Espera*?"
  // =========================================================================
  const isWaitlistInviteQuestion =
    lastAssistantMsg.includes('entrar na nossa *Fila de Espera*') ||
    lastAssistantMsg.includes('entrar na nossa fila de espera') ||
    lastAssistantMsg.includes('entrar na fila de espera') ||
    lastAssistantMsg.includes('ficar na nossa *Fila de Espera*') ||
    lastAssistantMsg.includes('ficar na nossa fila de espera') ||
    lastAssistantMsg.includes('ficar na fila de espera') ||
    lastAssistantMsg.includes('entrar na Fila de Espera') ||
    lastAssistantMsg.includes('ficar na Fila de Espera');

  if (isWaitlistInviteQuestion) {
    if (isYes(userMessage)) {
      const targetName =
        currentBeneficiary && currentBeneficiary !== 'Paciente'
          ? currentBeneficiary
          : (effectiveName && effectiveName !== 'Paciente' ? effectiveName : (patientName !== 'Paciente' ? patientName : 'Paciente WhatsApp'));

      const added = await addToWaitlist({
        patientName: targetName,
        patientPhone,
        preferredShift: 'Qualquer Horário',
        notes: 'Adicionado via WhatsApp Bot por indisponibilidade de agenda',
      });
      toolsExecuted.push({ name: 'adicionar_fila_espera', args: { patientPhone, patientName: targetName }, result: added });

      return {
        reply: `Perfeito, ${greetingName}! Você foi adicionado(a) à nossa *Fila de Espera* com prioridade. Logo que um paciente remarcar ou cancelar uma consulta, você receberá uma mensagem automática por aqui para aproveitar o horário liberado! 📲`,
        toolsExecuted,
      };
    } else if (isNo(userMessage)) {
      return {
        reply: 'Entendido! Caso deseje consultar outra data ou tiver alguma dúvida, estamos sempre à disposição.',
        toolsExecuted,
      };
    } else {
      return {
        reply: 'Por favor, responda com [1] SIM se deseja entrar na Fila de Espera ou [2] NÃO.',
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA A.5: VALIDAÇÃO / CONFIRMAÇÃO DO HORÁRIO ESCOLHIDO
  // Pergunta anterior: "Você confirma o agendamento em [Data] às [Horário]?"
  // =========================================================================
  if (lastAssistantMsg.includes('Você confirma o agendamento em') || lastAssistantMsg.includes('confirma o agendamento em')) {
    if (isYes(userMessage)) {
      // Extrair data e hora da mensagem de confirmação
      const confirmMatch = lastAssistantMsg.match(/Você confirma o agendamento em\s+([^\s]+)\s+às\s+(\d{1,2}:\d{2})/i);
      let dataHoraIso = '';

      if (confirmMatch) {
        const rawDate = confirmMatch[1].replace(/[?,.]/g, '');
        const rawTime = confirmMatch[2];

        // Converter DD/MM/AAAA para YYYY-MM-DD
        const parts = rawDate.split('/');
        if (parts.length >= 2) {
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2] ? (parts[2].length === 2 ? `20${parts[2]}` : parts[2]) : new Date().getFullYear().toString();
          dataHoraIso = `${y}-${m}-${d} ${rawTime}`;
        }
      }

      if (!dataHoraIso) {
        // Fallback para amanhã
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dataHoraIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')} 09:00`;
      }

      // Efetivar o agendamento no banco de dados
      const resAgendamento = await criarNovoAgendamento(patientId || '', dataHoraIso, clinicId, currentBeneficiary);
      toolsExecuted.push({
        name: 'criar_novo_agendamento',
        args: { patientId, dataHora: dataHoraIso, beneficiario: currentBeneficiary },
        result: resAgendamento,
      });

      // M-09: Mensagem Final de Confirmação
      return {
        reply: `Agendamento confirmado com sucesso!\n\n${doctorInfo.name} agradece o contato e deseja um ótimo dia!`,
        toolsExecuted,
      };
    } else if (isNo(userMessage)) {
      return {
        reply: 'Sem problemas! O agendamento não foi realizado. Qual outra data ou horário você prefere?',
        toolsExecuted,
      };
    } else {
      return {
        reply: 'Por favor, responda com [1] SIM para confirmar o agendamento ou [2] NÃO para cancelar.',
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA M-04: CONFIRMAÇÃO DO NOME DO PACIENTE / BENEFICIÁRIO
  // Pergunta anterior: "Gostaria de atendimento para o(a) Sr.(a) [Nome]?"
  // =========================================================================
  if (lastAssistantMsg.includes('Gostaria de atendimento para o(a) Sr.(a)')) {
    const matchName = lastAssistantMsg.match(/Sr\.\(a\)\s+([^?\n]+)/i);
    const beneficiaryName = matchName ? matchName[1].trim() : 'Paciente';

    if (isYes(userMessage)) {
      // Verificar se há vagas disponíveis antes de mandar o link
      const agendaCheck = await verificarAgendaTemHorariosDisponiveis(clinicId);
      if (!agendaCheck.hasSlots) {
        return {
          reply: `No momento, todos os horários da nossa agenda estão preenchidos (sem vagas disponíveis para ${beneficiaryName}).\n\nVocê gostaria de colocar o(a) Sr.(a) *${beneficiaryName}* na nossa *Fila de Espera*? Assim que surgir um horário liberado por cancelamento ou remarcação, avisaremos você imediatamente por aqui com prioridade! 📲\n\n[1] SIM, colocar na Fila de Espera\n[2] NÃO`,
          toolsExecuted,
        };
      }

      // Avança para a Etapa A.2 (Envio do Link de Agendamento com a Agenda Digital de 4 meses)
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://clini-desk-kappa.vercel.app');
      const agendamentoUrl = `${baseUrl.replace(/\/$/, '')}/agendamento?phone=${encodeURIComponent(
        patientPhone
      )}&name=${encodeURIComponent(beneficiaryName)}&forOther=true`;

      const titularPrefix = displayName ? `${displayName}, ` : '';
      return {
        reply: `${titularPrefix}para agilizar o atendimento de ${beneficiaryName}, você pode acessar os horários disponíveis de forma rápida e prática clicando no link abaixo:\n${agendamentoUrl}`,
        toolsExecuted,
      };
    } else if (isNo(userMessage)) {
      // Retorna para correção do nome (M-03)
      return {
        reply: 'Informe o nome da pessoa para a qual deseja atendimento.',
        toolsExecuted,
      };
    } else {
      return {
        reply: `Por favor, responda com [1] SIM ou [2] NÃO se gostaria de atendimento para o(a) Sr.(a) ${beneficiaryName}.`,
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA M-03: SOLICITAÇÃO DO NOME DO BENEFICIÁRIO
  // Pergunta anterior: "Informe o nome da pessoa para a qual deseja atendimento."
  // =========================================================================
  if (lastAssistantMsg.includes('Informe o nome da pessoa para a qual deseja atendimento')) {
    const personName = sanitizePersonName(userMessage);
    // Dispara M-04
    return {
      reply: `Gostaria de atendimento para o(a) Sr.(a) ${personName}?\n\n[1] SIM\n[2] NÃO`,
      toolsExecuted,
    };
  }

  // =========================================================================
  // ETAPA M-02: IDENTIFICAÇÃO DO TITULAR DO ATENDIMENTO (Etapa A.1)
  // Pergunta anterior: "O atendimento é para você mesmo?"
  // =========================================================================
  if (lastAssistantMsg.includes('O atendimento é para você mesmo?')) {
    if (isYes(userMessage)) {
      // Verificar se há vagas disponíveis antes de mandar o link
      const agendaCheck = await verificarAgendaTemHorariosDisponiveis(clinicId);
      if (!agendaCheck.hasSlots) {
        return {
          reply: `Olá ${greetingName}! No momento, todos os horários da nossa agenda estão preenchidos (sem vagas disponíveis no momento).\n\nVocê gostaria de entrar na nossa *Fila de Espera*? Assim que surgir uma desistência ou horário liberado por cancelamento ou remarcação, avisaremos você imediatamente por aqui com prioridade para garantir seu atendimento! 📲\n\n[1] SIM, quero entrar na Fila de Espera\n[2] NÃO`,
          toolsExecuted,
        };
      }

      // Titular é o próprio paciente! Avança para a Etapa A.2 com link da agenda de 4 meses
      const targetDisplayName = displayName || 'Paciente';
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://clini-desk-kappa.vercel.app');
      const agendamentoUrl = `${baseUrl.replace(/\/$/, '')}/agendamento?phone=${encodeURIComponent(
        patientPhone
      )}&name=${encodeURIComponent(targetDisplayName)}`;

      return {
        reply: `${targetDisplayName}, para agilizar seu atendimento você pode acessar os horários disponíveis de forma rápida e prática clicando no link abaixo:\n${agendamentoUrl}`,
        toolsExecuted,
      };
    } else if (isNo(userMessage)) {
      // Dispara M-03
      return {
        reply: 'Informe o nome da pessoa para a qual deseja atendimento.',
        toolsExecuted,
      };
    } else {
      return {
        reply: 'Por favor, responda com [1] SIM ou [2] NÃO se o atendimento é para você mesmo.',
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA M-06: FLUXO B - OFERTA DE CONHECIMENTO INSTITUCIONAL
  // Pergunta anterior: "Deseja conhecer um pouco mais sobre a Dra. [Nome]?"
  // =========================================================================
  if (lastAssistantMsg.includes('Deseja conhecer um pouco mais sobre a')) {
    if (isYes(userMessage)) {
      // M-07: Redirecionamento Web
      return {
        reply: `É com imensa satisfação que recebemos você aqui pela 1ª vez. Para conhecer um pouco mais sobre a ${doctorInfo.name}, clique no link abaixo:\n${doctorInfo.link}`,
        toolsExecuted,
      };
    } else if (isNo(userMessage)) {
      // M-08: Encerramento de Sessão
      return {
        reply: 'Esse é um canal exclusivo para agendamentos, reagendamentos ou remarcações. Esperamos vê-lo(a) aqui novamente em breve.',
        toolsExecuted,
      };
    } else {
      return {
        reply: `Por favor, responda com [1] SIM ou [2] NÃO se deseja conhecer um pouco mais sobre a ${doctorInfo.name}.`,
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA M-01: TRIAGEM INICIAL E MENSAGEM DE BOAS-VINDAS
  // Pergunta anterior: "Você deseja agendar uma consulta?"
  // =========================================================================
  if (lastAssistantMsg.includes('Você deseja agendar uma consulta?')) {
    if (isYes(userMessage)) {
      // 1. Verificar se a agenda possui horários disponíveis no período configurado
      const agendaCheck = await verificarAgendaTemHorariosDisponiveis(clinicId);
      if (!agendaCheck.hasSlots) {
        // NÃO HÁ VAGAS DISPONÍVEIS NA AGENDA:
        // Não envia link sem vagas, pergunta se o paciente quer entrar na Fila de Espera
        return {
          reply: `Olá ${greetingName}! No momento, todos os horários da nossa agenda estão preenchidos (sem vagas disponíveis no momento).\n\nVocê gostaria de entrar na nossa *Fila de Espera*? Assim que um paciente cancelar ou remarcar, avisaremos você imediatamente por aqui com prioridade para garantir seu atendimento! 📲\n\n[1] SIM, quero entrar na Fila de Espera\n[2] NÃO`,
          toolsExecuted,
        };
      }

      // Se há vagas na agenda, segue para a Etapa M-02 (Identificação do Titular)
      return {
        reply: 'O atendimento é para você mesmo?\n\n[1] SIM\n[2] NÃO',
        toolsExecuted,
      };
    } else if (isNo(userMessage)) {
      // Encaminha para o Fluxo B (M-06)
      return {
        reply: `Deseja conhecer um pouco mais sobre a ${doctorInfo.name}?\n\n[1] SIM\n[2] NÃO`,
        toolsExecuted,
      };
    } else {
      return {
        reply: 'Desculpe, não compreendi. Você deseja agendar uma consulta?\n\n[1] SIM\n[2] NÃO',
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // ETAPA A.2 / A.3: SELEÇÃO DE DATA E HORÁRIO NA GRADE
  // Paciente recebeu os horários e digitou um horário ou data
  // =========================================================================
  const isSchedulingStep =
    lastAssistantMsg.includes('horários disponíveis em nossa agenda') ||
    lastAssistantMsg.includes('Horários disponíveis para') ||
    lastAssistantMsg.includes('Qual outra data ou horário você prefere');

  if (isSchedulingStep) {
    const extractedTime = extractTimeFromText(userMessage);
    const extractedDate = extractDateFromText(userMessage);

    // Caso 1: Paciente informou um horário (ex: "09:00", "9h", "14:30")
    if (extractedTime) {
      let targetDateIso = '';
      let targetDateDisplay = '';

      if (extractedDate) {
        targetDateIso = extractedDate.dateStr;
        const [y, m, d] = targetDateIso.split('-');
        targetDateDisplay = `${d}/${m}/${y}`;
      } else {
        // Extrai a primeira data que foi listada na mensagem do assistente
        const dateMatch = lastAssistantMsg.match(/(\d{1,2}\/\d{1,2})/);
        if (dateMatch) {
          const [d, m] = dateMatch[1].split('/');
          const currentYear = new Date().getFullYear();
          targetDateIso = `${currentYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          targetDateDisplay = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${currentYear}`;
        } else {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          targetDateIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
          targetDateDisplay = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`;
        }
      }

      // Avança para a Etapa A.5 (Validação Final)
      return {
        reply: `Você confirma o agendamento em ${targetDateDisplay} às ${extractedTime}?\n\n[1] SIM\n[2] NÃO`,
        toolsExecuted,
      };
    }

    // Caso 2: Paciente informou apenas uma data (ex: "25/09/26", "amanhã")
    if (extractedDate) {
      const resHorarios = await buscarHorariosDisponiveis(extractedDate.dateStr, 'qualquer', clinicId);
      toolsExecuted.push({ name: 'buscar_horarios_disponiveis', args: { data_desejada: extractedDate.dateStr }, result: resHorarios });

      if (resHorarios.data?.slots?.length > 0) {
        return {
          reply: `📅 *Horários Disponíveis em ${extractedDate.formattedStr}:*\n\n${resHorarios.data.slots.map((s: string) => `• *${s}*`).join('\n')}\n\nPor favor, digite o horário desejado (ex: *${resHorarios.data.slots[0]}*).`,
          toolsExecuted,
        };
      } else {
        return {
          reply: `⚠️ No momento não encontramos horários disponíveis na agenda para ${extractedDate.formattedStr}.\n\nVocê gostaria de ficar na nossa *Fila de Espera*? Caso surja alguma desistência ou remarcação, avisaremos você imediatamente!\n\n[1] SIM, quero fila de espera\n[2] NÃO`,
          toolsExecuted,
        };
      }
    }
  }

  // =========================================================================
  // SUPORTE DIRETO A SOLICITAÇÃO DE FILA DE ESPERA / ENCAIXE
  // =========================================================================
  if (
    msgLower.includes('fila de espera') ||
    msgLower.includes('lista de espera') ||
    msgLower.includes('fila') ||
    msgLower.includes('encaixe') ||
    msgLower.includes('tem vaga')
  ) {
    return {
      reply: `Olá ${greetingName}! Gostaria de entrar na nossa *Fila de Espera* para ser avisado(a) automaticamente assim que surgir um horário liberado por cancelamento ou remarcação?\n\n[1] SIM, quero fila de espera\n[2] NÃO`,
      toolsExecuted,
    };
  }

  // =========================================================================
  // SUPORTE A PACIENTES QUE PEDEM REMARCAÇÃO OU CANCELAMENTO
  // =========================================================================
  if (msgLower.includes('remarcar') || msgLower.includes('reagendar') || msgLower.includes('outra data')) {
    const extractedDate = extractDateFromText(userMessage);
    if (!extractedDate) {
      return {
        reply: `📅 *Remarcação de Consulta*\n\nPara qual data você gostaria de verificar os horários disponíveis?\n\nPor favor, digite a data no formato **DD/MM/AA** (ex: *25/09/26*).`,
        toolsExecuted,
      };
    }
  }

  if (msgLower.includes('desmarcar') || msgLower.includes('cancelar') || msgLower.includes('desistir')) {
    const resAtual = await buscarConsultaAtual(patientPhone, clinicId);
    toolsExecuted.push({ name: 'buscar_consulta_atual', args: { telefone_paciente: patientPhone }, result: resAtual });

    if (resAtual.data?.appointmentId) {
      const resCancel = await cancelarConsulta(resAtual.data.appointmentId, 'Solicitado pelo paciente via WhatsApp');
      toolsExecuted.push({ name: 'cancelar_consulta', args: { agendamento_id: resAtual.data.appointmentId }, result: resCancel });
      return {
        reply: `${resCancel.message}\n\nSe precisar agendar uma nova consulta no futuro, estamos à disposição!`,
        toolsExecuted,
      };
    } else {
      return {
        reply: 'Não encontrei nenhuma consulta futura ativa agendada no seu número para ser cancelada.',
        toolsExecuted,
      };
    }
  }

  // =========================================================================
  // INÍCIO DE ATENDIMENTO / ENTRADA 1º CONTATO (M-01)
  // Ativado se histórico for novo, encerramento recente ou qualquer saudação
  // =========================================================================
  const isClosingState =
    lastAssistantMsg.includes('Esperamos vê-lo(a) aqui novamente em breve') ||
    lastAssistantMsg.includes('agradece o contato e deseja um ótimo dia') ||
    history.length === 0;

  const isGreeting =
    msgLower.includes('oi') ||
    msgLower.includes('olá') ||
    msgLower.includes('ola') ||
    msgLower.includes('bom dia') ||
    msgLower.includes('boa tarde') ||
    msgLower.includes('boa noite') ||
    isClosingState;

  if (isGreeting) {
    return {
      reply: `Olá ${greetingName}seja bem-vindo(a) ao consultório da ${doctorInfo.name}. Esse é um canal exclusivo para agendamentos, reagendamentos, remarcações.\n\nVocê deseja agendar uma consulta?\n\n[1] SIM\n[2] NÃO`,
      toolsExecuted,
    };
  }

  return null;
}

/**
 * Processador principal da conversa do Agente de IA com suporte ao POP oficial e OpenAI
 */
export async function processAgentMessage({
  patientPhone,
  userMessage,
  conversationHistory = [],
  clinicId,
  pushName,
}: ProcessMessageOptions): Promise<AgentProcessResult> {
  const toolsExecuted: Array<{ name: string; args: any; result: any }> = [];

  // 0. Buscar dados do paciente
  let patientName = 'Paciente';
  let patientId = '';
  try {
    const cleanPhone = patientPhone.replace(/\D/g, '');
    const patient = await prisma.patient.findFirst({
      where: {
        phone: { contains: cleanPhone.slice(-8) },
        ...(clinicId ? { clinicId } : {}),
      },
    });
    if (patient) {
      patientName = patient.name;
      patientId = patient.id;
    }
  } catch (e: any) {
    console.warn('Alerta ao consultar dados do paciente no banco:', e.message);
  }

  // 1. EXECUTA O MOTOR OFICIAL DO POP (Garante 100% de aderência aos scripts M-01 a M-09)
  const popResult = await runPOPWorkflow(patientPhone, userMessage, conversationHistory, clinicId, patientName, patientId, pushName);
  if (popResult) {
    return popResult;
  }

  // 2. OPENAI GPT-4o-mini (Para perguntas livres, dúvidas clínicas gerais ou informações institucionais)
  const apiKey = process.env.OPENAI_API_KEY;
  const doctorInfo = await getDoctorInfo(clinicId);

  if (apiKey && apiKey.startsWith('sk-') && !apiKey.includes('sua-chave')) {
    try {
      const openai = new OpenAI({ apiKey });

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}\nNome do médico(a): ${doctorInfo.name}\nNome do paciente atual: ${patientName}\nTelefone do paciente atual: ${patientPhone}`,
        },
        ...conversationHistory.map((msg) => ({
          role: msg.role === 'tool' ? ('assistant' as const) : msg.role,
          content: msg.content,
        })),
        { role: 'user', content: userMessage },
      ];

      let response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: openaiTools,
        tool_choice: 'auto',
      });

      let responseMessage = response.choices[0].message;

      while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

          if (toolName === 'buscar_consulta_atual' && !toolArgs.telefone_paciente) {
            toolArgs.telefone_paciente = patientPhone;
          }

          const toolResult = await executeToolCall(toolName, toolArgs, clinicId, patientId);
          toolsExecuted.push({ name: toolName, args: toolArgs, result: toolResult });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          tools: openaiTools,
        });
        responseMessage = response.choices[0].message;
      }

      return {
        reply: responseMessage.content || 'Desculpe, não consegui processar a resposta.',
        toolsExecuted,
      };
    } catch (err: any) {
      console.warn('Alerta na chamada da OpenAI API (usando fallback interno):', err.message);
    }
  }

  // 3. Fallback padrão amigável (orienta o paciente de volta ao menu M-01)
  const displayName = patientName && patientName !== 'Paciente' ? patientName.split(' ')[0] : '';
  const greetingName = displayName ? `${displayName}, ` : '';

  return {
    reply: `Olá ${greetingName}seja bem-vindo(a) ao consultório da ${doctorInfo.name}. Esse é um canal exclusivo para agendamentos, reagendamentos e remarcações.\n\nVocê deseja agendar uma consulta?\n\n[1] SIM\n[2] NÃO`,
    toolsExecuted,
  };
}
