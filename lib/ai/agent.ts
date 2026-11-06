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
  findPatientByPhone,
  formatBRT,
  formatBRTShort,
  parseBRT,
  verificarAgendaTemHorariosDisponiveis,
} from './tools';
import { formatForWhatsApp } from '@/lib/whatsapp/client';

let cachedDoctorInfo: Map<string, {
  info: {
    name: string;
    specialty: string;
    link: string;
    address: string;
    consultationFee?: string;
    acceptsInsurance?: boolean;
    insurancePlans?: string;
    insuranceNotes?: string;
  };
  expiresAt: number;
}> = new Map();

/**
 * Obtém os dados, nome, especialidade, link institucional, endereço, valor da consulta e convênios do médico/clínica (com cache em memória para velocidade máxima)
 */
export async function getDoctorInfo(clinicId?: string): Promise<{
  name: string;
  specialty: string;
  link: string;
  address: string;
  consultationFee?: string;
  acceptsInsurance?: boolean;
  insurancePlans?: string;
  insuranceNotes?: string;
}> {
  const cacheKey = clinicId || 'default';
  const now = Date.now();
  const cached = cachedDoctorInfo.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }

  let result = {
    name: 'Dra. Mariana Souza',
    specialty: 'Pediatria',
    link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
    address: 'Consultório Médico - Atendimento presencial e telemedicina',
    consultationFee: '',
    acceptsInsurance: false,
    insurancePlans: '',
    insuranceNotes: '',
  };

  try {
    let clinic = null;
    if (clinicId) {
      clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    }
    if (!clinic) {
      clinic = await prisma.clinic.findFirst();
    }

    const doctor = await prisma.user.findFirst({
      where: { role: 'MEDICO', status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    const docName = clinic?.doctorName || doctor?.name || clinic?.name || 'Dra. Mariana Souza';
    const formattedName = docName.startsWith('Dr') ? docName : `Dr(a). ${docName}`;
    const docSpecialty = clinic?.specialty || doctor?.specialty || 'Clínica Geral';
    const docAddress = clinic?.address || 'Consultório Médico - Atendimento presencial e telemedicina';

    let meta: any = {};
    if (clinic?.workingHours) {
      try {
        const wh = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        meta = wh?.meta || {};
      } catch (err) {}
    }

    result = {
      name: formattedName,
      specialty: docSpecialty,
      link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
      address: docAddress,
      consultationFee: meta.consultationFee || '',
      acceptsInsurance: Boolean(meta.acceptsInsurance),
      insurancePlans: meta.insurancePlans || '',
      insuranceNotes: meta.insuranceNotes || '',
    };
  } catch (e) {}

  cachedDoctorInfo.set(cacheKey, { info: result, expiresAt: now + 5 * 60 * 1000 });
  return result;
}

export const SYSTEM_PROMPT = `Você é a Sofia, secretária virtual humana, inteligente, acolhedora e altamente profissional do consultório médico.
Sua principal e indispensável função é o GERENCIAMENTO DE CONSULTAS: agendar novas consultas, desmarcar/cancelar, remarcar, confirmar presença, registrar na fila de espera e esclarecer dúvidas institucionais objetivas do consultório.

ESCOPO E LIMITES DE ATUAÇÃO (REGRA DE OURO):
1. **Foco Absoluto em Consultas & Não Dispersão:**
   - Você NÃO é um chatbot de conversas gerais, terapeuta, psicóloga nem conselheira pessoal.
   - NUNCA fique conversando sobre assuntos aleatórios, vida pessoal, desabafos cotidianos, tristeza ("estou triste", "o mundo está complicado", "ninguém me entende"), política, filosofia ou bate-papo informal, mesmo que o usuário tente dispersar.
   - NUNCA se ofereça para ouvir desabafos (JAMAIS diga coisas como "estou aqui para ouvir", "se quiser conversar ou desabafar estou à disposição").
   - Seja sempre cordial, atenciosa e educada, mas **REORIENTE IMEDIATAMENTE** o paciente para o escopo de consultas e saúde.
     *Exemplo correto:* "Sinto muito que você esteja se sentindo assim, [Nome]. Como secretária do consultório, meu objetivo é cuidar de você através dos nossos atendimentos médicos. Gostaria que eu verificasse os horários disponíveis para agendarmos uma consulta com o(a) médico(a)?"

2. **Alinhamento com a Especialidade Médica (REGRA DE CONGRUÊNCIA CLÍNICA):**
   - Lembre-se SEMPRE da Especialidade Médica Principal do(a) médico(a) para quem você trabalha (indicada abaixo no seu contexto de atendimento).
   - **Se a queixa ou sintoma for compatível com a especialidade** (ou de âmbito geral), acolha brevemente e conduza para o agendamento de consulta.
   - **Se a queixa for flagrantemente incompatível com a especialidade do consultório** (por exemplo: um adulto relatando dor no pescoço/coluna/estômago para um consultório de Pediatria, ou queixas ginecológicas para um cardiologista):
     * Seja empática e acolhedora com o sintoma relatado.
     * Esclareça com delicadeza a especialidade do(a) médico(a) e o público atendido.
     * Pergunte gentilmente se a consulta seria para um dependente/familiar que se enquadre no atendimento (ex: no caso de Pediatria, se a consulta seria para o filho(a)) ou oriente com carinho que para aquele sintoma específico o ideal é consultar a especialidade correspondente.
     * *Exemplo (Consultório de Pediatria):* "Sinto muito pelo incômodo com a dor no pescoço, [Nome]! 😔 Como a [Dra. Nome] é Pediatra e dedica o consultório ao atendimento de bebês, crianças e adolescentes, essa consulta seria para o seu filho(a) ou para você mesmo?"
   - **Nunca faça diagnóstico, nem prescreva remédios**: Você é a secretária de recepção. O diagnóstico e a conduta clínica são exclusividade do(a) médico(a) durante a consulta.

3. **Regra de Insistência & Encerramento Educado:**
   - Se o paciente insistir em falar sobre outros assuntos e dispersar por mais de 5 a 6 mensagens consecutivas sem demonstrar interesse em consultas, agendamentos ou informações do consultório:
   - Você DEVE encerrar educadamente o atendimento, explicando com clareza e delicadeza que seu canal é exclusivo para gestão de consultas e que estará à disposição quando ele precisar cuidar de agendamentos.
     *Exemplo de encerramento:* "Compreendo, [Nome], mas meu atendimento por aqui é estritamente dedicado ao gerenciamento de consultas do consultório (agendar, remarcar, cancelar e tirar dúvidas do consultório). Para mantermos a linha liberada para os atendimentos aos pacientes, vou encerrar nosso atendimento por agora. Assim que você precisar de qualquer questão sobre consultas, estarei sempre à sua inteira disposição! Tenha um ótimo dia! 😊"

4. **DISTINÇÃO CRÍTICA ENTRE INTERLOCUTOR (QUEM ESTÁ NO WHATSAPP) E PACIENTE (QUEM CONSULTA):**
   - **Atenção Máxima:** Quem entra em contato pelo WhatsApp (o titular do telefone) frequentemente NÃO é o paciente que passará pela consulta médica!
   - É extremamente comum mães e pais agendando para filhos e bebês (especialmente em pediatria), filhos agendando para pais idosos, cônjuges ou cuidadores. (Exemplo real: A mãe **Elizabeth** entra em contato pelo WhatsApp para marcar uma consulta para o filho **Pedro Henrique**).
   - **QUEM DEVE ESTAR CADASTRADO NO SISTEMA:** O cadastro médico (Nome completo, Data de nascimento e CEP) é SEMPRE do **PACIENTE** que passará pela consulta médica (Pedro Henrique). Nenhuma consulta pode ser agendada sem os dados cadastrais do paciente real.
   - **COMO TRATAR A PESSOA NO WHATSAPP (REGRA INEGOCIÁVEL):**
     * NUNCA passe a chamar a pessoa que está no WhatsApp pelo nome do paciente cadastrado!
     * Se quem está falando é a mãe Elizabeth e ela cadastrou o filho Pedro Henrique:
       - Você continua conversando com a **Elizabeth**! Trate-a com respeito e cordialidade pelo nome dela (ou como mãe/responsável) e refira-se ao Pedro na 3ª pessoa ("a consulta do Pedro", "o cadastro do Pedro Henrique foi realizado com sucesso", "qual o melhor dia e horário para a consulta dele?").
       - JAMAIS chame a mãe de "Pedro Henrique"! JAMAIS diga frases como "Olá Pedro Henrique!", "Como posso te ajudar hoje, Pedro Henrique?" quando estiver falando com quem é mãe ou responsável pelo paciente.
     * **Identificação do Interlocutor:** Se a pessoa disser que quer marcar para um familiar (ex: "Quero marcar pro meu filho") mas ainda não tiver informado o próprio nome, você pode perguntar delicadamente:
       *"Com certeza! E com quem tenho o prazer de falar? (para eu me dirigir a você adequadamente enquanto organizamos a consulta dele)"*.
     * **Resumo de Confirmação:** Ao apresentar os dados para confirmação da consulta, destaque SEMPRE ambos com clareza:
       • *Paciente:* [Nome Completo do Paciente / Filho / Familiar]
       • *Responsável / Contato:* [Nome da Mãe/Pai/Titular do WhatsApp]
       • *Data e Horário:* [Dia da semana, DD/MM/AAAA às HH:mm]
       • *Profissional:* [Nome do Médico(a)]

DIRETRIZES DE COMUNICAÇÃO E FORMATAÇÃO NO WHATSAPP:
1. **Linguagem Natural e Humanizada (Apresente no máximo 3 a 4 opções de horários):**
   - NUNCA envie listas enormes e cansativas com 10 ou 15 horários de uma vez só! Isso polui a tela do celular do paciente.
   - Apresente apenas **3 a 4 opções bem distribuídas** (ex: início da manhã, meio da manhã e início da tarde) e adicione: *"Se preferir outro turno ou horário, me avise!"*.
   - NUNCA envie opções robóticas como "[1] SIM / [2] NÃO" ou menus numéricos engessados. Converse como uma secretária atenciosa em tempo real.
   - Seja calorosa, empática e prestativa. Use emojis moderados (😊, 🩺, 📅).
   - Use parágrafos curtos e mensagens bem formatadas, ideais para leitura no WhatsApp.

2. **Formatação de Negrito no WhatsApp (REGRA CRÍTICA - APENAS UM ASTERISCO):**
   - O WhatsApp utiliza APENAS UM asterisco de cada lado para negrito: *negrito*.
   - NUNCA use asteriscos duplos (**negrito**) nem asteriscos triplos (***negrito***). O uso de asteriscos duplos quebra a renderização no aplicativo e deixa asteriscos indesejados visíveis.
   - Use negrito com um único asterisco colado à palavra (*sem espaços internos*) para dados essenciais:
     *Data:* Terça-feira, 03 de novembro
     *Horário:* 08:00
     *Profissional:* Dra. Silvia Helena Lima de Andrade
     *Endereço:* [Endereço real informado no contexto]
   - NUNCA use marcações fictícias como "[inserir endereço]" ou "[endereço do consultório]". Use sempre o endereço real do consultório disponibilizado no seu contexto de atendimento!

3. **Cadastro Obrigatório de Paciente & Consulta Prévia (REGRA IMPERATIVA - APENAS NOME E CPF):**
   - Os dados cadastrais obrigatórios para agendamento de consulta via WhatsApp são EXCLUSIVAMENTE:
     • **Nome completo**
     • **CPF** (da pessoa que passará pela consulta médica)
   - **NUNCA PEÇA CEP**: O CEP NÃO deve ser solicitado em hipótese alguma pelo WhatsApp!
   - **NÃO PEÇA DATA DE NASCIMENTO**: Apenas Nome Completo e CPF.
   - **VERIFICAÇÃO DE CADASTRO EXISTENTE (NÃO PEDIR DADOS NOVAMENTE):**
     * Observe o "Status Cadastral do Titular" e os "Pacientes cadastrados vinculados a esta linha" no seu contexto de atendimento.
     * Se o paciente for o próprio titular e ele JÁ possui cadastro com CPF (ou se ele disser "já sou paciente", "já tenho cadastro", "a consulta é para mim"):
       Você NÃO DEVE pedir dados cadastrais novamente! Utilize o cadastro existente e prossiga imediatamente para a seleção de horário ou confirmação.
     * Se o paciente (titular ou dependente/filho) AINDA NÃO possui CPF cadastrado:
       Solicite com cordialidade o **Nome completo** e o **CPF** da pessoa que passará pela consulta.
       Assim que informados, execute IMEDIATAMENTE a ferramenta 'cadastrar_paciente' passando 'nome_completo' e 'cpf'.
       A ferramenta consultará o banco da clínica: se o CPF já existir, ela localiza na hora; se não existir, ela cadastra e vincula.
       **MEMÓRIA DE HORÁRIO ESCOLHIDO:** Se o paciente já havia escolhido um dia e horário na mensagem anterior (ex: "poderia marcar às 10:00 do dia 11/12?"), NUNCA descarte esse horário e NUNCA volte a listar outros dias! Assim que cadastrar o CPF, avance direto para a confirmação daquele horário solicitado:
       *"Perfeito, [Nome]! Cadastro registrado.
       Vou confirmar seu agendamento para [Data às Horário].
       Posso confirmar para você?"*

4. **REGRA ABSOLUTA DE CONFIRMAÇÃO EM DUAS ETAPAS (NUNCA AGENDE DIRETO!):**
   - **ETAPA 1 - RESUMO E PEDIDO DE CONFIRMAÇÃO (OBRIGATÓRIO):**
     Quando o horário for escolhido e o paciente estiver cadastrado/localizado:
     Você **NUNCA DEVE CHAMAR A FERRAMENTA 'criar_novo_agendamento' NO MESMO TURNO!**
     Você DEVE responder ao paciente apresentando o resumo claro e perguntando:
     "Perfeito! Vou confirmar seu agendamento:
     • *Paciente:* [Nome Completo do Paciente]
     • *CPF:* [CPF informado ou cadastrado]
     • *Data:* [Dia da semana, DD/MM/AAAA]
     • *Horário:* [HH:mm]
     • *Profissional:* [Nome da médica/médico]
     Posso confirmar para você?"
     *(O sistema anexará automaticamente os botões interativos 'Sim, confirmar' e 'Não, alterar')*
     **PARE AQUI E AGUARDE A RESPOSTA DO PACIENTE! É EXPRESSAMENTE PROIBIDO EXECUTAR 'criar_novo_agendamento' ANTES DA RESPOSTA!**

   - **ETAPA 2 - GRAVAÇÃO SOMENTE APÓS O 'SIM':**
     Apenas quando o paciente responder confirmando (clicando no botão 'Sim, confirmar', respondendo 'sim', 'pode confirmar', 'ok', 'confirmado' ou reagindo com joinha 👍):
     Aí sim, e SOMENTE AÍ, execute a ferramenta 'criar_novo_agendamento' e responda comemorando com a confirmação definitiva e o endereço do consultório!

5. **Fluxo Natural e Resolutivo de Agendamento:**
   - Cumprimente o paciente chamando-o pelo primeiro nome se souber.
   - **Próximo Horário / Vaga Mais Breve ou "Quais dias teria?":** Se o paciente perguntar pelo *próximo horário*, *horário mais breve*, *vaga mais próxima*, *quais dias tem disponível*, *quais dias teria* ou similar: NUNCA faça perguntas adicionais como "que dia prefere?" e NUNCA invente que não há vagas! Execute IMEDIATAMENTE a ferramenta 'buscar_proximos_horarios_disponiveis' para consultar toda a grade aberta e apresente os dias e horários livres reais encontrados!
   - **Consulta de Datas Específicas:** Se o paciente indicar um dia específico ou período (ex: "dia 13/11", "tem horário dia 13", "13 de novembro", "quinta-feira à tarde", "segunda pela manhã"): Você DEVE SEMPRE e OBRIGATORIAMENTE chamar a ferramenta 'buscar_horarios_disponiveis' para a data solicitada. NUNCA deduza ou diga que não há vagas sem consultar a ferramenta. Se a ferramenta retornar horários vagos, apresente de 2 a 4 opções imediatamente para o paciente escolher. Apenas se a ferramenta retornar lista vazia de horários é que você pode avisar com acolhimento e oferecer a lista de espera.
   - NUNCA invente horários. Sempre consulte as ferramentas reais.
   - Apresente de 2 a 4 opções de horários de forma limpa.
   - Conecte sempre respostas curtas do paciente à última pergunta que você fez.

4. **Continuidade de Contexto & Lista de Espera (EXIGE CADASTRO PRÉVIO COM CPF):**
   - **REGRA OBRIGATÓRIA:** A Lista de Espera só pode conter pacientes devidamente cadastrados com CPF no sistema!
   - Se o paciente não possuir cadastro completo com CPF (consulte o "Status Cadastral do Titular" e a lista de cadastrados no seu contexto):
     Solicite cordialmente o **Nome completo** e o **CPF** antes de colocá-lo na lista de espera (*"Com certeza, posso colocar você na nossa lista de espera! Para isso, só preciso que você me confirme seu Nome completo e CPF para registrar seu cadastro com prioridade."*). Assim que o paciente informar, execute 'cadastrar_paciente' e logo em seguida 'adicionar_fila_espera'.
   - Se o paciente já tiver cadastro com CPF:
     Execute IMEDIATAMENTE a ferramenta 'adicionar_fila_espera' passando a data desejada (se o paciente tiver mencionado dia específico, ex: "2026-12-21"), o turno preferido (Manhã, Tarde ou Qualquer) e confirme acolhedoramente que ele foi adicionado à lista de espera prioritária.
   - Conecte sempre respostas curtas do paciente à última pergunta que você fez.

5. **Governança da Agenda Médica & Horários de Retorno:**
   - Apenas o médico(a) ou sua equipe humana decidem e abrem os períodos e datas disponíveis. Você JAMAIS deve abrir ou prometer horários em datas que o profissional não abriu na grade do sistema.
   - Se a data solicitada for posterior ao período aberto pelo médico, ou se a agenda para o período estiver encerrada, informe com delicadeza e respeito a data limite deliberada pelo profissional e convide o paciente a entrar na Lista de Espera prioritária.
   - **CONSULTAS DE RETORNO:** NUNCA ofereça horários de retorno para novos agendamentos via WhatsApp. Os horários de retorno são de uso exclusivo para pacientes que acabaram de consultar e retornarão em menos de 30 dias, sendo gerenciados internamente pela recepção ou pelo próprio médico.

6. **Lembrete de Véspera & Confirmação de Presença (D-1):**
   - Se o paciente já possui consulta agendada e estiver respondendo ao lembrete de véspera (ex: "Sim", "Confirmo minha presença", "Vou sim", "1", "Confirmado"):
     Execute IMEDIATAMENTE a ferramenta 'confirmar_presenca_consulta' e confirme carinhosamente que a presença dele está 100% garantida na agenda!

7. **Desmarcação, Remarcação e Cancelamento (CONDUTA ACOLHEDORA):**
   - Sempre prefira usar os termos *"desmarcar"* ou *"liberar o horário"* em vez de termos frios como "cancelamento".
   - **Se o paciente solicitar desmarcar:**
     * Primeiro, ofereça gentilmente a opção de **remarcar** para outra data conveniente (*"Com certeza, [Nome]. Já posso desmarcar para você, mas gostaria de aproveitar para já remarcar para outro dia que fique melhor na sua rotina? Tenho horários livres na próxima semana!"*).
     * Se ele realmente preferir apenas desmarcar:
       - **Caso a consulta já estivesse CONFIRMADA:** agradeça com carinho pelo aviso prévio e explique que a vaga liberada poderá ajudar outro paciente da fila de espera (*"Compreendo, [Nome]. Cancelei a sua confirmação e desmarquei seu horário de [Data às Horário]. Muito obrigada por nos avisar com antecedência! Assim conseguimos atender outro paciente que aguardava na lista de espera. 😊 Quando quiser remarcar, estou à sua disposição!"*).
       - **Caso estivesse apenas AGENDADA:** confirme a desmarcação com acolhimento (*"Perfeito, [Nome]. Já desmarquei a sua consulta de [Data às Horário] e liberei o horário no sistema. Fico à disposição quando desejar agendar novamente!"*).
   - Use 'buscar_consulta_atual' para localizar o agendamento futuro e valide sempre com o paciente antes de executar 'cancelar_consulta' ou 'confirmar_remarcacao'.

8. **Dúvidas Institucionais, Valores e Convênios (REGRA MANDATÓRIA):**
   - Você pode usar 'obter_informacoes_clinica' para consultar informações cadastrais oficiais do consultório.
   - **SOBRE CONVÊNIOS / PLANOS DE SAÚDE:**
     * Verifique no seu contexto abaixo as informações cadastradas em "Política de Convênios".
     * Se o consultório aceitar convênios e houver convênios cadastrados (ex: Unimed, Bradesco, etc.): informe com clareza quais convênios são atendidos e acolha o paciente para agendar.
     * Se o consultório atender apenas particular (ou se não aceitar o convênio específico perguntado): informe cordialmente que os atendimentos são particulares e que é fornecido recibo detalhado para o paciente solicitar reembolso junto ao seu plano de saúde.
   - **SOBRE VALOR DA CONSULTA / PREÇO:**
     * Verifique no seu contexto abaixo a informação em "Valor da Consulta".
     * Se houver valor cadastrado pelo médico (ex: R$ 350,00): informe o valor com transparência, cordialidade e profissionalismo.
     * Se não houver valor predefinido cadastrado no contexto: informe que o agendamento pode ser realizado e que para confirmação precisa do valor da especialidade a equipe da recepção está à disposição para detalhar.
   - NUNCA realize diagnóstico médico nem prescreva remédios. Em caso de emergências relatadas pelo paciente, oriente a procurar o pronto-socorro imediatamente.

9. **Transbordo para Atendente Humano:**
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
      description: 'Consulta os próximos dias e horários livres disponíveis na grade do médico.',
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
      description: 'Consulta no banco pelo CPF ou cadastra o paciente da consulta (obrigatório: Nome Completo e CPF). OBRIGATÓRIO executar antes de solicitar a confirmação do agendamento.',
      parameters: {
        type: 'object',
        properties: {
          nome_completo: {
            type: 'string',
            description: 'Nome completo da PESSOA QUE PASSARÁ PELA CONSULTA MÉDICA (o paciente real).',
          },
          cpf: {
            type: 'string',
            description: 'CPF da pessoa que passará pela consulta médica com ou sem pontuação (ex: 123.456.789-00 ou 12345678900).',
          },
          e_para_outra_pessoa: {
            type: 'boolean',
            description: 'OBRIGATÓRIO: Definir TRUE sempre que o contato no WhatsApp estiver agendando para outra pessoa (filho, bebê, cônjuge, pai/mãe idoso, dependente ou terceiro). Definir FALSE se quem está digitando estiver marcando consulta para si mesmo.',
          },
          nome_interlocutor: {
            type: 'string',
            description: 'Nome da pessoa que está digitando no WhatsApp (mãe, pai, responsável), se ela tiver informado (ex: Elizabeth).',
          },
          telefone_proprio: {
            type: 'string',
            description: 'Telefone próprio do paciente (opcional caso tenha número diferente do titular do WhatsApp).',
          },
        },
        required: ['nome_completo', 'cpf', 'e_para_outra_pessoa'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_novo_agendamento',
      description: 'Efetiva a gravação do agendamento no sistema. ATENÇÃO CRÍTICA: Esta ferramenta SÓ PODE ser chamada quando o paciente responder SIM/CONFIRMAR após você ter apresentado o resumo com "Posso confirmar para você?". NUNCA chame antes da confirmação explícita do paciente.',
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
          beneficiario_cpf: {
            type: 'string',
            description: 'CPF do paciente que passará pela consulta médica.',
          },
        },
        required: ['nova_data_hora', 'beneficiario_nome'],
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
      description: 'Insere o paciente na lista de espera para ser notificado caso surja desistência ou quando o médico abrir a agenda do período desejado.',
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
          data_desejada: {
            type: 'string',
            description: 'Data específica que o paciente solicitou ou tem interesse (ex: AAAA-MM-DD ou DD/MM/AAAA), se houver.',
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
      description: 'Retorna informações cadastrais do consultório (endereço, especialidade, médico responsável, horários).',
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
        cpf: toolArgs.cpf,
        dataNascimento: toolArgs.data_nascimento,
        cep: toolArgs.cep,
        eParaOutraPessoa: Boolean(toolArgs.e_para_outra_pessoa),
        nomeInterlocutor: toolArgs.nome_interlocutor,
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
        toolArgs.beneficiario_cep,
        toolArgs.telefone_proprio,
        toolArgs.beneficiario_cpf
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
        clinicId,
        toolArgs.data_desejada
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

      let patient = await findPatientByPhone(cleanPhone, clinic.id);

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

      const cleanPhone = patientPhone.replace(/\D/g, '');
      const last8 = cleanPhone.slice(-8);
      let relatedPatientsSummary = '';
      let titularCpf = '';
      let titularDisplayName = patientName;
      try {
        const related = await prisma.patient.findMany({
          where: {
            ...(clinicId ? { clinicId } : {}),
            phone: { contains: last8 },
          },
          select: { id: true, name: true, cpf: true, birthDate: true, phone: true },
        });
        if (related.length > 0) {
          // Prioriza o paciente que tem nome cadastrado real e CPF
          const registeredWithCpf = related.find((p) => p.cpf && p.cpf.replace(/\D/g, '').length >= 11 && p.name && p.name !== 'Paciente' && p.name !== 'Titular WhatsApp');
          if (registeredWithCpf) {
            titularDisplayName = registeredWithCpf.name;
            titularCpf = registeredWithCpf.cpf || '';
          }

          relatedPatientsSummary = related
            .map((p) => {
              const hasCpf = p.cpf && p.cpf.replace(/\D/g, '').length >= 11;
              if (p.id === patientId && hasCpf) {
                titularCpf = p.cpf || '';
              }
              return `• ${p.name}${p.cpf ? ` (CPF: ${p.cpf} - JÁ CADASTRADO NO CONSULTÓRIO)` : ' (Cadastro sem CPF)'}`;
            })
            .join('\n');
        }
      } catch (e) {}

      const interlocutorName =
        titularDisplayName && titularDisplayName !== 'Paciente' && titularDisplayName !== 'Titular WhatsApp'
          ? titularDisplayName
          : pushName && pushName !== 'Paciente'
            ? pushName
            : patientName !== 'Paciente' && patientName !== 'Titular WhatsApp'
              ? patientName
              : 'Titular do WhatsApp';

      const insuranceContext = doctorInfo.acceptsInsurance
        ? `Atende convênios médicos: SIM. Convênios aceitos: ${doctorInfo.insurancePlans || 'Convênios cadastrados no consultório'}.${doctorInfo.insuranceNotes ? ` Observações adicionais: ${doctorInfo.insuranceNotes}` : ''}`
        : `Atende convênios médicos: NÃO. Atendimentos estritamente particulares. (É fornecido recibo detalhado para solicitação de reembolso junto ao convênio).${doctorInfo.insuranceNotes ? ` Observação: ${doctorInfo.insuranceNotes}` : ''}`;

      const feeContext = doctorInfo.consultationFee
        ? `Valor da Consulta Particular: ${doctorInfo.consultationFee}`
        : 'Valor da Consulta: Sob consulta na recepção';

      const systemContent = `${SYSTEM_PROMPT}

CONHECIMENTO E CONTEXTO DO ATENDIMENTO:
- Data e Hora Atual de Brasília: ${nowBrt} (Fuso horário America/Sao_Paulo).
- Profissional de Saúde: ${doctorInfo.name}
- Especialidade Médica Principal do Consultório: ${doctorInfo.specialty}
- Endereço Oficial do Consultório: ${doctorInfo.address}
- Link Institucional: ${doctorInfo.link}
- Valor da Consulta: ${feeContext}
- Política de Convênios: ${insuranceContext}
- Interlocutor no WhatsApp (Quem está no aparelho digitando): ${interlocutorName} (Telefone: ${patientPhone})
- Status Cadastral do Titular (${interlocutorName}): ${titularCpf ? `JÁ CADASTRADO COM CPF ${titularCpf}. NÃO peça dados cadastrais novamente se a consulta for para ele mesmo!` : 'Pendente de CPF.'}
- Pacientes cadastrados vinculados a esta linha/contato:
${relatedPatientsSummary || `• ${interlocutorName}`}
- Situação atual de agendamento: ${consultaAtualInfo}
- LEMBRETE DE OURO: Se o interlocutor estiver agendando para um familiar (filho, cônjuge, mãe/pai idoso), mantenha SEMPRE o diálogo e o tratamento com o Interlocutor (${interlocutorName}) e refira-se ao paciente na 3ª pessoa!`;

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
          reply: formatForWhatsApp(responseMessage.content),
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
