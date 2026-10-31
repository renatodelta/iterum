import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import {
  buscarConsultaAtual,
  buscarHorariosDisponiveis,
  buscarProximosHorariosDisponiveis,
  cancelarConsulta,
  confirmarRemarcacao,
  criarNovoAgendamento,
  confirmarPresencaConsulta,
  cadastrarPaciente,
  transferirParaHumano,
  adicionarFilaEspera,
  obterInformacoesClinica,
  formatBRT,
  formatBRTShort,
  parseBRT,
  verificarAgendaTemHorariosDisponiveis,
} from './tools';

let cachedDoctorInfo: { info: { name: string; link: string }; expiresAt: number } | null = null;

/**
 * Obtém os dados e nome da médica e o link institucional da clínica (com cache em memória para velocidade máxima)
 */
export async function getDoctorInfo(clinicId?: string): Promise<{ name: string; link: string }> {
  const now = Date.now();
  if (cachedDoctorInfo && cachedDoctorInfo.expiresAt > now) {
    return cachedDoctorInfo.info;
  }

  let result = {
    name: 'Dra. Mariana Souza',
    link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
  };

  try {
    const doctor = await prisma.user.findFirst({
      where: { role: 'MEDICO', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (doctor?.name) {
      const name = doctor.name.startsWith('Dr') ? doctor.name : `Dra. ${doctor.name}`;
      result = {
        name,
        link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
      };
    } else if (clinicId) {
      const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
      if (clinic?.name?.includes('Dr')) {
        result = {
          name: clinic.name,
          link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
        };
      }
    }
  } catch (e) {}

  cachedDoctorInfo = { info: result, expiresAt: now + 5 * 60 * 1000 };
  return result;
}

export const SYSTEM_PROMPT = `Você é a Sofia, secretária virtual humana, inteligente, acolhedora e altamente profissional do consultório médico Iterum.
Seu objetivo é conduzir o atendimento no WhatsApp com extrema empatia e fluidez, realizando agendamentos, remarcações, cancelamentos e tirando dúvidas de forma resolutiva, ágil e elegante.

DIRETRIZES DE COMUNICAÇÃO:
1. **Linguagem Natural e Humanizada:**
   - NUNCA envie opções robóticas como "[1] SIM / [2] NÃO" ou menus numéricos engessados. Converse como uma recepcionista atenciosa em tempo real.
   - Seja calorosa, empática e prestativa. Use emojis moderados (😊, 🩺, 📅).
   - Use parágrafos curtos e mensagens bem formatadas, ideais para leitura no WhatsApp.
   - Use negrito para destacar *datas*, *horários* e *nomes de médicos*.

2. **Cadastro Obrigatório de Paciente (REGRA IMPERATIVA):**
   - NENHUMA pessoa pode ter uma consulta marcada sem estar devidamente cadastrada no sistema da clínica.
   - Os dados principais e obrigatórios para o cadastro são:
     • **Nome completo**
     • **Data de nascimento** (formato DD/MM/AAAA)
     • **CEP de onde mora**
   - **Agendamento para OUTRA PESSOA (Terceiro / Familiar):**
     Se o titular do WhatsApp estiver marcando para outra pessoa (filho, pai, mãe, cônjuge, etc., como "Quero marcar para o Edyr José"):
     - Peça com gentileza os 3 dados obrigatórios dessa pessoa:
       "Com certeza! Para realizarmos o cadastro do(a) [Nome] no sistema da clínica e garantirmos a consulta, você poderia me informar:
       • *Nome completo dele(a)*
       • *Data de nascimento*
       • *CEP de onde mora*?"
     - Assim que o usuário informar os dados, acione IMEDIATAMENTE a ferramenta 'cadastrar_paciente' com 'e_para_outra_pessoa: true'.
   - **Agendamento para o PRÓPRIO TITULAR:**
     Se o titular estiver marcando para si mesmo e for o primeiro contato ou ainda não tiver informado data de nascimento e CEP, solicite esses 3 dados de forma acolhedora e chame 'cadastrar_paciente' com 'e_para_outra_pessoa: false'.
   - *Importante:* No consultório, caso o médico queira, o cadastro poderá ser complementado presencialmente com outros dados.

3. **Fluxo Natural e Resolutivo de Agendamento:**
   - Cumprimente o paciente chamando-o pelo primeiro nome se souber.
   - **Próximo Horário / Vaga Mais Breve:** Se o paciente perguntar pelo *próximo horário*, *horário mais breve*, *vaga mais próxima* ou similar: NUNCA faça perguntas adicionais como "que dia prefere?". Execute IMEDIATAMENTE a ferramenta 'buscar_proximos_horarios_disponiveis' e apresente os dias e horários livres mais próximos!
   - **Consulta de Datas Específicas:** Se o paciente indicar um dia específico ou período (ex: "dia 13/11", "tem horário dia 13", "13 de novembro", "quinta-feira à tarde", "segunda pela manhã"): Você DEVE SEMPRE e OBRIGATORIAMENTE chamar a ferramenta 'buscar_horarios_disponiveis' para a data solicitada. NUNCA deduza ou diga que não há vagas sem consultar a ferramenta. Se a ferramenta retornar horários vagos, apresente de 2 a 4 opções imediatamente para o paciente escolher. Apenas se a ferramenta retornar lista vazia de horários é que você pode avisar com acolhimento e oferecer a lista de espera.
   - NUNCA invente horários. Sempre consulte as ferramentas reais.
   - Apresente de 2 a 4 opções de horários de forma limpa.
   - Ao paciente escolher o horário desejado e os dados cadastrais estiverem preenchidos, **solicite a confirmação ativa** resumindo claramente os detalhes:
     "Perfeito! Vou confirmar seu agendamento:
     • *Paciente:* [Nome Completo do Paciente]
     • *Data:* [Dia da semana, DD/MM/AAAA]
     • *Horário:* [HH:mm]
     • *Profissional:* [Nome da médica/médico]
     Posso confirmar para você?"
   - **EXECUÇÃO IMEDIATA DA GRAVAÇÃO:** Assim que o paciente confirmar (ex: "sim", "sim. obrigado!", "pode confirmar", "ok", "perfeito", "confirmado"):
     Você DEVE OBRIGATORIAMENTE executar a ferramenta 'criar_novo_agendamento' enviando 'nova_data_hora' (no formato AAAA-MM-DD HH:mm, por exemplo: '2026-11-18 14:15') e 'beneficiario_nome' (o nome completo da pessoa que vai consultar).
     NUNCA reenvie perguntas de confirmação se ele já confirmou. Grave imediatamente no banco de dados através da ferramenta.
   - Após a execução com sucesso da ferramenta, conclua confirmando com carinho que a consulta foi agendada e registrada com sucesso no sistema, informando o endereço do consultório e desejando um ótimo dia!

4. **Continuidade de Contexto & Lista de Espera:**
   - Se você perguntou ou ofereceu colocar o paciente na Lista de Espera (ex: "Se você preferir, posso colocar seu nome na lista de espera... O que você acha?") e o paciente responder "Pode ser", "Sim", "Ok", "Quero", "Pode colocar" ou similar:
     Execute IMEDIATAMENTE a ferramenta 'adicionar_fila_espera' e confirme acolhedoramente que ele foi adicionado à lista de espera prioritária.
   - Conecte sempre respostas curtas do paciente à última pergunta que você fez.

4. **Governança da Agenda Médica & Horários de Retorno:**
   - Apenas o médico(a) ou sua equipe humana decidem e abrem os períodos e datas disponíveis. Você JAMAIS deve abrir ou prometer horários em datas que o profissional não abriu na grade do sistema.
   - Se a data solicitada for posterior ao período aberto pelo médico, ou se a agenda para o período estiver encerrada, informe com delicadeza e respeito a data limite deliberada pelo profissional e convide o paciente a entrar na Lista de Espera prioritária.
   - **CONSULTAS DE RETORNO:** NUNCA ofereça horários de retorno para novos agendamentos via WhatsApp. Os horários de retorno são de uso exclusivo para pacientes que acabaram de consultar e retornarão em menos de 30 dias, sendo gerenciados internamente pela recepção ou pelo próprio médico.

5. **Lembrete de Véspera & Confirmação de Presença (D-1):**
   - Se o paciente já possui consulta agendada e estiver respondendo ao lembrete de véspera (ex: "Sim", "Confirmo minha presença", "Vou sim", "1", "Confirmado"):
     Execute IMEDIATAMENTE a ferramenta 'confirmar_presenca_consulta' e confirme carinhosamente que a presença dele está 100% garantida na agenda!

6. **Remarcação e Cancelamento:**
   - Se o paciente desejar remarcar ou cancelar, use 'buscar_consulta_atual' para localizar o agendamento futuro.
   - Valide sempre com o paciente antes de executar 'cancelar_consulta' ou 'confirmar_remarcacao'.

7. **Dúvidas Institucionais:**
   - Você pode usar 'obter_informacoes_clinica' para informar endereço, especialidade e dados de contato.
   - Se perguntarem sobre planos de saúde: informe que os atendimentos são particulares com emissão de recibo detalhado para solicitação de reembolso no convênio.
   - NUNCA realize diagnóstico médico nem prescreva remédios. Em caso de emergências relatadas pelo paciente, oriente a procurar o pronto-socorro imediatamente.

8. **Transbordo para Atendente Humano:**
   - Se o paciente expressar desejo explícito de falar com uma pessoa ("quero falar com atendente", "falar com secretária humana", "falar com alguém"), ou estiver muito irritado/com caso complexo, acione a ferramenta 'transferir_para_humano' e informe com acolhimento que a equipe da recepção assumirá o atendimento a seguir.`;

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
      description: 'Consulta os próximos dias e horários livres disponíveis na grade da clínica.',
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
            description: 'Data desejada no formato DD/MM/AAAA, DD/MM, AAAA-MM-DD ou por extenso (ex: 13/11, 13/11/2026, 2026-11-13).',
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
      name: 'cadastrar_paciente',
      description: 'Cadastra ou atualiza um paciente no sistema da clínica com os dados obrigatórios (Nome completo, Data de nascimento e CEP). OBRIGATÓRIO executar antes de criar qualquer agendamento.',
      parameters: {
        type: 'object',
        properties: {
          nome_completo: {
            type: 'string',
            description: 'Nome completo da pessoa que passará pela consulta médica.',
          },
          data_nascimento: {
            type: 'string',
            description: 'Data de nascimento da pessoa no formato DD/MM/AAAA (ex: 15/05/1980).',
          },
          cep: {
            type: 'string',
            description: 'CEP de residência da pessoa (ex: 12245-000).',
          },
          e_para_outra_pessoa: {
            type: 'boolean',
            description: 'True se o titular do WhatsApp estiver agendando para outra pessoa (filho, cônjuge, pai, etc.); False se for para si mesmo.',
          },
          telefone_proprio: {
            type: 'string',
            description: 'Telefone próprio do paciente (opcional caso tenha número diferente do titular).',
          },
        },
        required: ['nome_completo', 'data_nascimento', 'cep'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_novo_agendamento',
      description: 'Efetiva um novo agendamento de consulta na clínica após a confirmação clara do paciente e após os dados cadastrais estarem preenchidos.',
      parameters: {
        type: 'object',
        properties: {
          nova_data_hora: {
            type: 'string',
            description: 'Data e horário da consulta no formato AAAA-MM-DD HH:mm (ex: 2026-10-31 14:00).',
          },
          beneficiario_nome: {
            type: 'string',
            description: 'Nome completo da pessoa que receberá o atendimento médico.',
          },
          beneficiario_nascimento: {
            type: 'string',
            description: 'Data de nascimento do paciente (DD/MM/AAAA).',
          },
          beneficiario_cep: {
            type: 'string',
            description: 'CEP de residência do paciente.',
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
  {
    type: 'function',
    function: {
      name: 'adicionar_fila_espera',
      description: 'Insere o paciente na lista de espera para ser notificado caso surja desistência.',
      parameters: {
        type: 'object',
        properties: {
          paciente_nome: {
            type: 'string',
            description: 'Nome completo do paciente.',
          },
          turno_preferido: {
            type: 'string',
            description: 'Preferência de turno: Manhã, Tarde ou Qualquer Horário.',
          },
          dias_preferidos: {
            type: 'string',
            description: 'Dias da semana de preferência.',
          },
        },
        required: ['paciente_nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transferir_para_humano',
      description: 'Transfere o atendimento para a equipe humana da recepção e pausa as respostas do assistente virtual.',
      parameters: {
        type: 'object',
        properties: {
          motivo: {
            type: 'string',
            description: 'Motivo da transferência.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obter_informacoes_clinica',
      description: 'Retorna informações cadastrais da clínica (endereço, especialidade, médico responsável, horários).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_presenca_consulta',
      description: 'Confirma a presença do paciente para a consulta agendada quando este responde ao lembrete de véspera (D-1) ou expressa confirmação de presença.',
      parameters: {
        type: 'object',
        properties: {
          agendamento_id: {
            type: 'string',
            description: 'ID do agendamento a ser confirmado (opcional se puder ser localizado pelo telefone).',
          },
        },
      },
    },
  },
];

/**
 * Executa uma Tool chamada pela IA
 */
async function executeToolCall(
  toolName: string,
  toolArgs: any,
  clinicId?: string,
  patientId?: string,
  patientPhone?: string
) {
  console.log(`🤖 Executando ferramenta IA [${toolName}] com argumentos:`, toolArgs);
  switch (toolName) {
    case 'buscar_consulta_atual':
      return await buscarConsultaAtual(toolArgs.telefone_paciente || patientPhone || '', clinicId);
    case 'buscar_proximos_horarios_disponiveis':
      return await buscarProximosHorariosDisponiveis(clinicId, 3);
    case 'buscar_horarios_disponiveis':
      return await buscarHorariosDisponiveis(toolArgs.data_desejada, toolArgs.periodo, clinicId);
    case 'cadastrar_paciente':
      return await cadastrarPaciente({
        telefoneTitular: patientPhone || '',
        nomeCompleto: toolArgs.nome_completo,
        dataNascimento: toolArgs.data_nascimento,
        cep: toolArgs.cep,
        eParaOutraPessoa: Boolean(toolArgs.e_para_outra_pessoa),
        telefoneProprio: toolArgs.telefone_proprio,
        clinicId,
      });
    case 'criar_novo_agendamento':
      return await criarNovoAgendamento(
        patientId || '',
        toolArgs.nova_data_hora,
        clinicId,
        toolArgs.beneficiario_nome,
        toolArgs.beneficiario_nascimento,
        toolArgs.beneficiario_cep
      );
    case 'cancelar_consulta':
      return await cancelarConsulta(toolArgs.agendamento_id, toolArgs.motivo);
    case 'confirmar_remarcacao':
      return await confirmarRemarcacao(toolArgs.agendamento_id, toolArgs.nova_data_hora);
    case 'confirmar_presenca_consulta':
      return await confirmarPresencaConsulta(patientPhone || '', toolArgs.agendamento_id, clinicId);
    case 'adicionar_fila_espera':
      return await adicionarFilaEspera(
        patientPhone || '',
        toolArgs.paciente_nome,
        toolArgs.turno_preferido,
        toolArgs.dias_preferidos,
        clinicId
      );
    case 'transferir_para_humano':
      return await transferirParaHumano(patientPhone || '', toolArgs.motivo, clinicId);
    case 'obter_informacoes_clinica':
      return await obterInformacoesClinica(clinicId);
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
  patientId?: string;
}

export interface AgentProcessResult {
  reply: string;
  toolsExecuted: Array<{ name: string; args: any; result: any }>;
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
  patientId: initialPatientId,
}: ProcessMessageOptions): Promise<AgentProcessResult> {
  const toolsExecuted: Array<{ name: string; args: any; result: any }> = [];

  // 0. Localizar ou cadastrar o paciente garantindo que patientId sempre exista
  let patientName = pushName && pushName !== 'Paciente' ? pushName : 'Paciente';
  let patientId = initialPatientId || '';
  if (!patientId) {
    try {
      const cleanPhone = patientPhone.replace(/\D/g, '');
      let clinic = clinicId ? await prisma.clinic.findUnique({ where: { id: clinicId } }) : await prisma.clinic.findFirst();
      if (!clinic) {
        clinic = await prisma.clinic.create({
          data: {
            name: 'Consultório Dra. Mariana Souza',
            doctorName: 'Dra. Mariana Souza',
            specialty: 'Pediatria',
            email: 'dra.mariana@iterum.med.br',
            phone: '+5511999999999',
            slotDurationMinutes: 30,
            minCancelHours: 2,
          },
        });
      }

      let patient = await prisma.patient.findFirst({
        where: {
          clinicId: clinic.id,
          phone: { contains: cleanPhone.slice(-8) },
        },
      });

      if (!patient) {
        patient = await prisma.patient.create({
          data: {
            clinicId: clinic.id,
            name: patientName,
            phone: patientPhone,
          },
        });
      }

      patientId = patient.id;
      patientName = patient.name;
    } catch (e: any) {
      console.warn('Alerta ao consultar/criar dados do paciente no banco:', e.message);
    }
  }

  // 1. MOTOR PRINCIPAL DE IA (OPENAI GPT-4o-mini ou GOOGLE GEMINI via Function Calling)
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const doctorInfo = await getDoctorInfo(clinicId);

  let aiClient: OpenAI | null = null;
  let modelName = 'gpt-4o-mini';

  // Prioriza Gemini se configurado ou se OpenAI estiver sem saldo/chave
  if (geminiKey && geminiKey.startsWith('AIza') && !geminiKey.includes('sua-chave')) {
    aiClient = new OpenAI({
      apiKey: geminiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
    modelName = 'gemini-1.5-flash';
  } else if (openaiKey && openaiKey.startsWith('sk-') && !openaiKey.includes('sua-chave')) {
    aiClient = new OpenAI({ apiKey: openaiKey });
    modelName = 'gpt-4o-mini';
  }

  if (aiClient) {
    try {
      const nowBrt = formatBRT(new Date(), true);

      // Buscar se o paciente já tem consulta futura para contextualizar o assistente
      let consultaAtualInfo = 'Nenhuma consulta futura agendada.';
      try {
        const consultaAtual = await buscarConsultaAtual(patientPhone, clinicId);
        if (consultaAtual.success && consultaAtual.data) {
          consultaAtualInfo = `Consulta agendada para: ${consultaAtual.data.dataFormatada} (${consultaAtual.data.status})`;
        }
      } catch (e) {}

      const effectiveName = pushName && pushName !== 'Paciente' ? pushName : patientName;

      const systemContent = `${SYSTEM_PROMPT}

CONTEXTO TEMPORAL E DO ATENDIMENTO:
- Data e Hora Atual de Brasília: ${nowBrt} (Fuso horário America/Sao_Paulo).
- Profissional de Saúde: ${doctorInfo.name}
- Paciente em atendimento: ${effectiveName || 'Paciente'} (Telefone: ${patientPhone})
- Situação atual de agendamento: ${consultaAtualInfo}`;

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemContent,
        },
        ...conversationHistory.map((msg) => ({
          role: msg.role === 'tool' ? ('assistant' as const) : msg.role,
          content: msg.content,
        })),
        { role: 'user', content: userMessage },
      ];

      let response = await aiClient.chat.completions.create({
        model: modelName,
        messages,
        tools: openaiTools,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 300,
      });

      let responseMessage = response.choices[0].message;

      // Execução de ferramentas em loop enquanto a IA solicitar
      let iterations = 0;
      while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0 && iterations < 5) {
        iterations++;
        messages.push(responseMessage);

        for (const toolCall of responseMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

          if (toolName === 'buscar_consulta_atual' && !toolArgs.telefone_paciente) {
            toolArgs.telefone_paciente = patientPhone;
          }

          const toolResult = await executeToolCall(toolName, toolArgs, clinicId, patientId, patientPhone);
          toolsExecuted.push({ name: toolName, args: toolArgs, result: toolResult });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        response = await aiClient.chat.completions.create({
          model: modelName,
          messages,
          tools: openaiTools,
          temperature: 0.3,
          max_tokens: 300,
        });
        responseMessage = response.choices[0].message;
      }

      if (responseMessage.content) {
        return {
          reply: responseMessage.content,
          toolsExecuted,
        };
      }
    } catch (err: any) {
      console.error(`❌ Erro na chamada da API de IA (${modelName}):`, err.message);
    }
  }

  // 3. Fallback acolhedor e humanizado caso a API de IA esteja indisponível
  const displayName = patientName && patientName !== 'Paciente' ? patientName.split(' ')[0] : '';
  const greeting = displayName ? `Olá ${displayName}! ` : 'Olá! ';

  return {
    reply: `${greeting}Seja muito bem-vindo(a) ao consultório da ${doctorInfo.name}. Como posso ajudar você hoje com seus agendamentos ou dúvidas?`,
    toolsExecuted,
  };
}
