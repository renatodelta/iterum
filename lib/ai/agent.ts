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
  formatDoctorHonorific,
} from './tools';
import { formatForWhatsApp } from '@/lib/whatsapp/client';

export interface DoctorInfo {
  name: string;
  rawName: string;
  specialty: string;
  crm?: string;
  phone?: string;
  email?: string;
  minCancelHours?: number;
  link: string;
  address: string;
  consultationFee?: string;
  acceptsInsurance?: boolean;
  insurancePlans?: string;
  insuranceNotes?: string;
  googleMapsUrl?: string;
  wazeUrl?: string;
  parkingTips?: string;
  blockedDates?: Array<{ date: string; shift?: 'ALL' | 'MANHA' | 'TARDE'; reason?: string }>;
}

let cachedDoctorInfo: Map<string, {
  info: DoctorInfo;
  expiresAt: number;
}> = new Map();

/**
 * Obtém os dados profissionais completos do médico/clínica (com cache em memória para velocidade máxima)
 */
export async function getDoctorInfo(clinicId?: string): Promise<DoctorInfo> {
  const cacheKey = clinicId || 'default';
  const now = Date.now();
  const cached = cachedDoctorInfo.get(cacheKey);
  // Cache reduzido para 45 segundos para refletir alterações de Dados Profissionais quase em tempo real
  if (cached && cached.expiresAt > now) {
    return cached.info;
  }

  let result: DoctorInfo = {
    name: 'Dra. Mariana Souza',
    rawName: 'Mariana Souza',
    specialty: 'Pediatria',
    crm: 'CRM/SP 148.910',
    phone: '',
    email: '',
    minCancelHours: 2,
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

    const docName = clinic?.doctorName || clinic?.name || doctor?.name || 'Dra. Mariana Souza';
    const formattedName = formatDoctorHonorific(docName);
    const docSpecialty = clinic?.specialty || doctor?.specialty || 'Clínica Geral';
    const docAddress = clinic?.address || 'Consultório Médico - Atendimento presencial e telemedicina';
    const docCrm = clinic?.crm || doctor?.crm || '';
    const docPhone = clinic?.phone || '';
    const docEmail = clinic?.email || '';
    const minCancelHours = clinic?.minCancelHours || 2;

    let meta: any = {};
    if (clinic?.workingHours) {
      try {
        const wh = typeof clinic.workingHours === 'string' ? JSON.parse(clinic.workingHours) : clinic.workingHours;
        meta = wh?.meta || {};
      } catch (err) {}
    }

    result = {
      name: formattedName,
      rawName: docName,
      specialty: docSpecialty,
      crm: docCrm,
      phone: docPhone,
      email: docEmail,
      minCancelHours,
      link: process.env.DOCTOR_INFO_URL || 'https://clini-desk-kappa.vercel.app',
      address: docAddress,
      consultationFee: meta.consultationFee || '',
      acceptsInsurance: Boolean(meta.acceptsInsurance),
      insurancePlans: meta.insurancePlans || '',
      insuranceNotes: meta.insuranceNotes || '',
      googleMapsUrl: meta.googleMapsUrl || (docAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(docAddress)}` : ''),
      wazeUrl: meta.wazeUrl || (docAddress ? `https://waze.com/ul?q=${encodeURIComponent(docAddress)}&navigate=yes` : ''),
      parkingTips: meta.parkingTips || 'Vagas rotativas e estacionamento conveniado nas proximidades do consultório.',
      blockedDates: Array.isArray(meta.blockedDates) ? meta.blockedDates : [],
    };
  } catch (e) {}

  cachedDoctorInfo.set(cacheKey, { info: result, expiresAt: now + 45 * 1000 });
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
1. **SAUDAÇÃO OBRIGATÓRIA PELO PRIMEIRO NOME & JANELA DE 24 HORAS (REGRA INEGOCIÁVEL):**
   - Em TODAS as suas respostas ou início de atendimento, dirija-se SEMPRE ao interlocutor chamando-o pelo seu primeiro nome de cadastro no WhatsApp (ex: "Olá, [Primeiro Nome]!", "[Primeiro Nome], no momento...").
   - **MEMÓRIA DE 24 HORAS & NOVO ATENDIMENTO:** O sistema mantém apenas as últimas 24 horas de conversa na sua memória ativa. Se o histórico estiver vazio ou se este for um novo contato após 24 horas sem mensagens, trate SEMPRE como um NOVO atendimento inicial: cumprimente com cordialidade pelo primeiro nome, apresente-se como Sofia do consultório do(a) médico(a) e pergunte como pode ajudar hoje com consultas ou agendamentos!
   - JAMAIS inicie respostas de forma fria, robótica ou impessoal sem usar o primeiro nome do interlocutor! Mesmo ao informar falta de vagas, horários cheios ou convite para a lista de espera, comece sempre cumprimentando pelo primeiro nome!

2. **REGRA PÉTREA DE AUSÊNCIA DE VAGAS: ENCAMINHAMENTO EXCLUSIVO PARA LISTA DE ESPERA (NÃO SUGIRA OUTRAS OPÇÕES!):**
   - Sempre que a data solicitada não tiver horários livres, que o período aberto da agenda estiver encerrado, ou que a grade inteira estiver sem vagas:
   - Você DEVE SEMPRE e EXCLUSIVAMENTE direcionar o paciente para a **Lista de Espera prioritária**!
   - **É EXPRESSAMENTE PROIBIDO SUGERIR OPÇÕES DIFERENTES!** (NUNCA sugira ao paciente ligar para o consultório, procurar outro médico, comparecer sem agendamento, etc.).
   - **NÃO FAÇA PERGUNTAS VAGAS COMO "O que você prefere?":** Todos os pacientes sem vaga devem ser encaminhados para a fila de espera.
   - Explique acolhedoramente que quando novas vagas forem abertas pelo consultório, o responsável pela agenda clicará num botão no sistema que notificará automaticamente os pacientes da fila via WhatsApp!
   - Inicie imediatamente o registro na fila de espera perguntando o turno de preferência (manhã, tarde ou qualquer) e confirmando o nome de quem passará pela consulta (sem pedir CPF!).

3. **CONFIRMAÇÃO DO AGENDAMENTO E RECONHECIMENTO DE BOTÕES E JOINHA (👍):**
   - Quando você apresentar o resumo com "Posso confirmar para você?", você deve aguardar a confirmação do paciente.
   - Se o paciente responder:
     * Clicando no botão 'Sim, confirmar' (ou 'btn_confirmar_sim');
     * Digitando '1', 'sim', 'pode confirmar', 'confirmar', 'ok', 'com certeza';
     * Ou enviando/reagindo com o emoji de joinha 👍 (em qualquer tom de pele: 👍, 👍🏻, 👍🏼, 👍🏽, 👍🏾, 👍🏿):
     -> **VOCÊ DEVE IMEDIATAMENTE EXECUTAR A FERRAMENTA 'criar_novo_agendamento'** com a data/hora e dados do paciente definidos no resumo anterior!
     -> NUNCA repita a pergunta de confirmação e NUNCA fique em silêncio!
     -> Conclua comemorando a consulta marcada com sucesso e fornecendo o endereço completo do consultório!

4. **Linguagem Natural e Humanizada (Apresente no máximo 3 a 4 opções de horários):**
   - NUNCA envie listas enormes e cansativas com 10 ou 15 horários de uma vez só! Isso polui a tela do celular do paciente.
   - Apresente apenas **3 a 4 opções bem distribuídas** (ex: início da manhã, meio da manhã e início da tarde) e adicione: *"Se preferir outro turno ou horário, me avise!"*.
   - Seja calorosa, empática e prestativa. Use emojis moderados (😊, 🩺, 📅).
   - Use parágrafos curtos e mensagens bem formatadas, ideais para leitura no WhatsApp.

5. **Formatação de Negrito no WhatsApp (REGRA CRÍTICA - APENAS UM ASTERISCO):**
   - O WhatsApp utiliza APENAS UM asterisco de cada lado para negrito: *negrito*.
   - NUNCA use asteriscos duplos (**negrito**) nem asteriscos triplos (***negrito***). O uso de asteriscos duplos quebra a renderização no aplicativo e deixa asteriscos indesejados visíveis.
   - Use negrito com um único asterisco colado à palavra (*sem espaços internos*) para dados essenciais:
     *Data:* Terça-feira, 03 de novembro
     *Horário:* 08:00
     *Profissional:* Dra. Silvia Helena Lima de Andrade
     *Endereço:* [Endereço real informado no contexto]
   - NUNCA use marcações fictícias como "[inserir endereço]" ou "[endereço do consultório]". Use sempre o endereço real do consultório disponibilizado no seu contexto de atendimento!

3. **Cadastro de Paciente & Regra de Identificação (Nome Completo e CPF):**
   - Os dados cadastrais padrão para agendamento de consulta via WhatsApp são:
     • **Nome completo**
     • **CPF** (da pessoa que passará pela consulta médica)
   - **NUNCA PEÇA CEP**: O CEP NÃO deve ser solicitado em hipótese alguma pelo WhatsApp!
   - **NÃO PEÇA DATA DE NASCIMENTO**: Apenas Nome Completo e CPF.
   - **REGRA ESSENCIAL PARA DEPENDENTES / FILHOS SEM CPF (NUNCA TRAVE O AGENDAMENTO!):**
     * Peça sempre cordialmente o CPF de quem passará pela consulta médica.
     * **Se o interlocutor disser que a consulta é para filho, bebê, criança ou dependente e que NÃO TEM CPF (ou que não está com o documento em mãos no momento):**
       1. **JAMAIS recuse, pause ou trave o agendamento!**
       2. Utilize o **CPF do próprio responsável/titular** (se já constar no contexto ou se for informado), OU execute imediatamente a ferramenta 'cadastrar_paciente' passando 'nome_completo', 'e_para_outra_pessoa: true' e omitindo o CPF (ou passando vazio).
       3. Acolha com gentileza e oriente cordialmente a levar a certidão de nascimento no dia da consulta:
          *"Sem problemas! Já registrei o agendamento do(a) [Nome do dependente]. No dia da consulta, pedimos apenas que leve a certidão de nascimento (ou documento com foto) dele(a) na recepção para finalizarmos o cadastro."*
       4. Avance imediatamente para a confirmação do horário escolhido (apresentando o resumo e perguntando "Posso confirmar para você?").
   - **VERIFICAÇÃO DE CADASTRO EXISTENTE (NÃO PEDIR DADOS NOVAMENTE):**
     * Observe o "Status Cadastral do Titular" e os "Pacientes cadastrados vinculados a esta linha" no seu contexto de atendimento.
     * Se o paciente for o próprio titular e ele JÁ possui cadastro com CPF (ou se ele disser "já sou paciente", "já tenho cadastro", "a consulta é para mim"):
       Você NÃO DEVE pedir dados cadastrais novamente! Utilize o cadastro existente e prossiga imediatamente para a seleção de horário ou confirmação.
     * Se for o titular e ele ainda não tem CPF, solicite com carinho o Nome Completo e CPF dele.
     * Se for dependente/filho: solicite com cordialidade o **Nome completo** e o **CPF** de quem passará pela consulta. Se informados, execute 'cadastrar_paciente'. Se o responsável disser que o dependente não possui CPF ou está sem o documento, aplique a regra de dependentes acima e prossiga sem travar!
     * **MEMÓRIA DE HORÁRIO ESCOLHIDO:** Se o paciente já havia escolhido um dia e horário na mensagem anterior (ex: "poderia marcar às 10:00 do dia 11/12?"), NUNCA descarte esse horário e NUNCA volte a listar outros dias! Assim que cadastrar, avance direto para a confirmação daquele horário solicitado:
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
     • *CPF:* [CPF informado, CPF do responsável ou 'Apresentar certidão de nascimento na recepção']
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

6. **Fila de Espera Inteligente (SEM EXIGÊNCIA DE CPF & FORMATO EXATO):**
   - **REGRA ESSENCIAL:** Para entrar na **Fila de Espera**, **NUNCA PEÇA CPF** e **NUNCA EXECUTE 'cadastrar_paciente'**!
   - Quando não houver vagas livres na data desejada, quando a agenda para o período solicitado estiver encerrada, ou quando o paciente pedir para aguardar vaga/desistência:
     * Você DEVE responder EXATAMENTE com o texto abaixo, SEM inferir ou preencher previamente o nome do paciente:

"Para adicionar você à fila de espera, preciso apenas confirmar algumas informações:
📝 Nome completo do paciente: 
📅 Turno preferido: Manhã, Tarde ou Qualquer?

Com os dados acima poderei registrar sua solicitação! 😊"

     * Assim que o paciente responder informando o nome completo e o turno preferido, execute IMEDIATAMENTE a ferramenta 'adicionar_fila_espera' passando 'paciente_nome' e 'turno_preferido'.
     * Conecte sempre respostas curtas do paciente à última pergunta que você fez.

7. **Governança da Agenda Médica & Horários de Retorno:**
   - Apenas o médico(a) ou sua equipe humana decidem e abrem os períodos e datas disponíveis. Você JAMAIS deve abrir ou prometer horários em datas que o profissional não abriu na grade do sistema.
   - Se a data solicitada for posterior ao período aberto pelo médico, ou se a agenda para o período estiver encerrada, informe com delicadeza e respeito a data limite deliberada pelo profissional e convide o paciente a entrar na Lista de Espera prioritária usando exatamente o formato da regra 6.
   - **CONSULTAS DE RETORNO:** NUNCA ofereça horários de retorno para novos agendamentos via WhatsApp. Os horários de retorno são de uso exclusivo para pacientes que acabaram de consultar e retornarão em menos de 30 dias, sendo gerenciados internamente pela recepção ou pelo próprio médico.

8. **Lembrete de Véspera & Confirmação de Presença (D-1):**
   - Se o paciente já possui consulta agendada e estiver respondendo ao lembrete de véspera (ex: "Sim", "Confirmo minha presença", "Vou sim", "1", "Confirmado"):
     Execute IMEDIATAMENTE a ferramenta 'confirmar_presenca_consulta' e confirme carinhosamente que a presença dele está 100% garantida na agenda!

9. **Desmarcação, Remarcação e Cancelamento (SEGURANÇA E CONDUTA ACOLHEDORA):**
   - Sempre prefira usar os termos *"desmarcar"* ou *"liberar o horário"* em vez de termos frios como "cancelamento".
   - **QUEM PODE DESMARCAR (REGRA INEGOCIÁVEL DE SEGURANÇA):**
     * Apenas o **próprio paciente** pode desmarcar a sua consulta.
     * O paciente também pode desmarcar a consulta de um **dependente seu** (filho, cônjuge, idoso ou familiar diretamente cadastrado e vinculado ao seu número/conta).
   - **PROIBIÇÃO ABSOLUTA PARA TERCEIROS (PROTEÇÃO À PRIVACIDADE E LGPD):**
     * Terceiros NUNCA podem desmarcar consultas de outros pacientes, em nenhuma hipótese, mesmo que forneçam o nome ou CPF de outra pessoa.
     * Se o usuário no WhatsApp pedir para consultar ou desmarcar a consulta de alguém que NÃO seja ele mesmo e nem um dependente vinculado à sua conta/linha telefônica:
       - Você DEVE recusar educadamente, explicando com gentileza e firmeza:
         *"Por questões de sigilo médico, segurança e privacidade dos pacientes (LGPD), o cancelamento de consultas só pode ser realizado pelo próprio paciente cadastrado ou pelo responsável de dependentes vinculados ao seu WhatsApp. Não é permitido desmarcar consultas de outros pacientes. Caso ele deseje desmarcar, peço que ele próprio entre em contato pelo seu WhatsApp cadastrado ou diretamente com a nossa recepção."*
       - NUNCA execute 'cancelar_consulta' para terceiros!
   - **Se o paciente solicitar desmarcar para si mesmo ou para dependente seu:**
     * Primeiro, ofereça gentilmente a opção de **remarcar** para outra data conveniente (*"Com certeza, [Nome]. Já posso desmarcar para você, mas gostaria de aproveitar para já remarcar para outro dia que fique melhor na sua rotina? Tenho horários livres na próxima semana!"*).
     * Se ele realmente preferir apenas desmarcar:
       - **Caso a consulta já estivesse CONFIRMADA:** agradeça com carinho pelo aviso prévio e explique que a vaga liberada poderá ajudar outro paciente da fila de espera (*"Compreendo, [Nome]. Cancelei a sua confirmação e desmarquei o horário de [Data às Horário]. Muito obrigada por nos avisar com antecedência! Assim conseguimos atender outro paciente que aguardava na lista de espera. 😊 Quando quiser remarcar, estou à sua disposição!"*).
       - **Caso estivesse apenas AGENDADA:** confirme a desmarcação com acolhimento (*"Perfeito, [Nome]. Já desmarquei a consulta de [Data às Horário] e liberei o horário no sistema. Fico à disposição quando desejar agendar novamente!"*).
     * Se forem encontradas múltiplas consultas futuras para esse paciente/dependente, liste as opções encontradas (data e horário de forma limpa, sem exibir IDs técnicos) e pergunte gentilmente qual delas ele deseja desmarcar.
     * Quando o usuário indicar a data/horário ou número da opção escolhida, execute 'cancelar_consulta' passando o 'agendamento_id' correspondente.
   - Use 'buscar_consulta_atual' para localizar o agendamento futuro e valide sempre com o paciente antes de executar 'cancelar_consulta' ou 'confirmar_remarcacao'.

10. **USO ATIVO E PERSONALIZADO DOS DADOS PROFISSIONAIS (HUMANIZAÇÃO E PROXIMIDADE):**
   - **NUNCA FALE "O MÉDICO" OU "O PROFISSIONAL" DE FORMA IMPESSOAL:**
     * Você trabalha diretamente para o(a) médico(a) indicado no seu contexto: **[Profissional de Saúde]** (Especialidade: [Especialidade Médica Principal], CRM: [Registro de Conselho]).
     * **É EXPRESSAMENTE PROIBIDO** responder de forma fria, robótica ou genérica como:
       - ❌ *"A agenda do médico está aberta apenas até 11 de dezembro..."*
       - ❌ *"Datas posteriores ainda não foram liberadas pelo médico/profissional..."*
       - ❌ *"Assim que o médico liberar novas vagas..."*
     * **SEMPRE se refira ao médico pelo seu nome profissional e especialidade:**
       - ✅ *"A agenda da **Dra. Mariana Souza** (Pediatria) está aberta até 11 de dezembro..."*
       - ✅ *"Datas posteriores ainda não foram disponibilizadas na grade pela **Dra. Mariana**..."*
       - ✅ *"Assim que a **Dra. Mariana** liberar novas datas para consultas de Pediatria, avisaremos você com prioridade na nossa lista de espera! 😊"*
       - ✅ *"Sua consulta cardiológica com o **Dr. Renato Silva**..."*
   - **VALOR DA CONSULTA (HONORÁRIOS PARTICULARES):**
     * Quando o paciente perguntar sobre o valor da consulta ou preço, informe com transparência, elegância e cordialidade o valor configurado em Dados Profissionais (ex: *"A consulta particular com o(a) [Nome do Médico] é no valor de [Valor]"*).
   - **CONVÊNIOS, PLANOS DE SAÚDE E REEMBOLSO:**
     * Se o consultório aceitar convênios: informe com precisão os planos de saúde cadastrados.
     * Se o consultório atende estritamente particular: explique com acolhimento que as consultas são particulares e que o consultório emite recibo e nota fiscal detalhados com o CRM do(a) médico(a) para que o paciente solicite o reembolso integral ou parcial junto ao seu convênio.
   - **ENDEREÇO, LOCALIZAÇÃO, COMO CHEGAR E ESTACIONAMENTO (CARD COMPLETO):**
     * Ao confirmar qualquer consulta ou quando o paciente perguntar o local de atendimento ou como chegar, forneça com carinho o endereço completo e o Card de Navegação e Estacionamento:
       📍 *Como Chegar & Localização:*
       🏢 *Endereço:* [Endereço oficial informado no contexto]
       🗺️ *Google Maps:* [Link do Maps informado no contexto]
       🚗 *Waze:* [Link do Waze informado no contexto]
       🅿️ *Estacionamento:* [Dica de estacionamento informada no contexto]
   - **REGISTRO PROFISSIONAL (CRM):**
     * Utilize o CRM do médico quando solicitado pelo paciente ou ao orientar sobre a emissão de recibo para reembolso.

11. **Dúvidas Institucionais Gerais e Limites:**
   - Você pode usar 'obter_informacoes_clinica' para consultar informações cadastrais oficiais do consultório.
   - NUNCA realize diagnóstico médico nem prescreva remédios. Em caso de emergências relatadas pelo paciente, oriente a procurar o pronto-socorro imediatamente.

12. **Transbordo para Atendente Humano:**
    - Se o paciente expressar desejo explícito de falar com uma pessoa ("quero falar com atendente", "falar com secretária humana", "falar com alguém"), ou estiver muito irritado/com caso complexo, acione a ferramenta 'transferir_para_humano' e informe com acolhimento que a equipe da recepção assumirá o atendimento a seguir.`;

// Definição das ferramentas no formato OpenAI JSON Schema
const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'buscar_consulta_atual',
      description: 'Localiza consultas futuras agendadas para o próprio paciente ou para um dependente vinculado ao seu cadastro (filho, bebê, familiar da mesma linha de contato). NUNCA utilize para consultar agendamentos de terceiros.',
      parameters: {
        type: 'object',
        properties: {
          telefone_paciente: {
            type: 'string',
            description: 'Telefone do paciente com DDD (ex: 11999991111).',
          },
          nome_paciente: {
            type: 'string',
            description: 'Nome completo do dependente vinculado a ser buscado (se estiver consultando para um filho/dependente da sua família).',
          },
          cpf_paciente: {
            type: 'string',
            description: 'CPF do dependente (se informado pelo paciente/responsável).',
          },
        },
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
      description: 'Consulta no banco pelo CPF ou cadastra o paciente da consulta (Nome Completo é obrigatório; CPF é opcional no caso de dependente/menor sem documento no momento). OBRIGATÓRIO executar antes de solicitar a confirmação do agendamento.',
      parameters: {
        type: 'object',
        properties: {
          nome_completo: {
            type: 'string',
            description: 'Nome completo da PESSOA QUE PASSARÁ PELA CONSULTA MÉDICA (o paciente real).',
          },
          cpf: {
            type: 'string',
            description: 'CPF da pessoa que passará pela consulta médica OU CPF do responsável (no caso de dependente/filho menor). Se for dependente/filho que ainda não possui CPF ou não está com o documento em mãos, pode ser omitido ou enviado como vazio.',
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
        required: ['nome_completo', 'e_para_outra_pessoa'],
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
            description: 'CPF do paciente que passará pela consulta médica ou do responsável legal (opcional para dependentes sem CPF próprio).',
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
      description: 'Cancela/desmarca um agendamento futuro do próprio paciente ou de seu dependente diretamente vinculado. NUNCA pode ser executada para consultas de terceiros.',
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
      description: 'Insere o paciente na lista de espera para ser notificado caso surja desistência ou quando o médico abrir a agenda do período desejado. NÃO exige CPF, apenas o nome completo do paciente e o turno preferido.',
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
      return await buscarConsultaAtual(
        toolArgs.telefone_paciente || patientPhone || '',
        clinicId,
        toolArgs.nome_paciente,
        toolArgs.cpf_paciente,
        patientPhone,
        patientId
      );
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
      return await cancelarConsulta(toolArgs.agendamento_id, toolArgs.motivo, patientPhone, patientId);
    case 'confirmar_remarcacao':
      return await confirmarRemarcacao(toolArgs.agendamento_id, toolArgs.nova_data_hora, patientPhone, patientId);
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

      const interlocutorFirstName =
        interlocutorName &&
        interlocutorName !== 'Titular do WhatsApp' &&
        interlocutorName !== 'Paciente' &&
        interlocutorName !== 'Titular WhatsApp'
          ? interlocutorName.trim().split(/\s+/)[0]
          : '';

      const insuranceContext = doctorInfo.acceptsInsurance
        ? `Atende convênios médicos: SIM. Convênios aceitos: ${doctorInfo.insurancePlans || 'Convênios cadastrados no consultório'}.${doctorInfo.insuranceNotes ? ` Observações adicionais: ${doctorInfo.insuranceNotes}` : ''}`
        : `Atende convênios médicos: NÃO. Atendimentos estritamente particulares. (É fornecido recibo detalhado para solicitação de reembolso junto ao convênio).${doctorInfo.insuranceNotes ? ` Observação: ${doctorInfo.insuranceNotes}` : ''}`;

      const feeContext = doctorInfo.consultationFee
        ? `Valor da Consulta Particular: ${doctorInfo.consultationFee}`
        : 'Valor da Consulta: Sob consulta na recepção';

      const systemContent = `${SYSTEM_PROMPT}

CONHECIMENTO E CONTEXTO DO ATENDIMENTO (DADOS PROFISSIONAIS DA CLÍNICA):
- PRIMEIRO NOME DO INTERLOCUTOR (OBRIGATÓRIO USAR NA SAUDAÇÃO E EM TODAS AS RESPOSTAS): "${interlocutorFirstName || 'Paciente'}"
- Data e Hora Atual de Brasília: ${nowBrt} (Fuso horário America/Sao_Paulo).
- Profissional de Saúde: ${doctorInfo.name}
- Registro de Conselho (CRM): ${doctorInfo.crm || 'Disponível no consultório'}
- Especialidade Médica Principal do Consultório: ${doctorInfo.specialty}
- Endereço Oficial e Sala de Atendimento: ${doctorInfo.address}
- Link Direto de Navegação no Google Maps: ${doctorInfo.googleMapsUrl || 'Disponível com o endereço'}
- Link Direto de Navegação no Waze: ${doctorInfo.wazeUrl || 'Disponível com o endereço'}
- Dicas de Onde Estacionar: ${doctorInfo.parkingTips || 'Vagas rotativas e estacionamento conveniado próximos ao consultório'}
- Celular / WhatsApp da Clínica: ${doctorInfo.phone || 'Este canal'}
- E-mail Profissional: ${doctorInfo.email || 'Não informado'}
- Antecedência Mínima para Cancelamento / Remarcação: ${doctorInfo.minCancelHours || 2} horas
- Valor da Consulta Particular: ${feeContext}
- Política de Convênios e Reembolso: ${insuranceContext}
- Link Institucional: ${doctorInfo.link}
- Interlocutor no WhatsApp (Quem está no aparelho digitando): ${interlocutorName} (Telefone: ${patientPhone})
- Status Cadastral do Titular (${interlocutorName}): ${titularCpf ? `JÁ CADASTRADO COM CPF ${titularCpf}. NÃO peça dados cadastrais novamente se a consulta for para ele mesmo!` : 'Pendente de CPF.'}
- Pacientes cadastrados vinculados a esta linha/contato:
${relatedPatientsSummary || `• ${interlocutorName}`}
- Situação atual de agendamento: ${consultaAtualInfo}
- REGRA INEGOCIÁVEL DE SAUDAÇÃO: Em TODAS as suas respostas, cumprimente ou dirija-se ao interlocutor pelo seu primeiro nome ("${interlocutorFirstName || 'Paciente'}"). Ex: "Olá, ${interlocutorFirstName || 'Paciente'}!", "${interlocutorFirstName || 'Paciente'}, no momento...". NUNCA inicie respostas sem cumprimentar ou chamar pelo primeiro nome!
- REGRA PÉTREA DE AUSÊNCIA DE VAGAS: Se a agenda estiver sem horários disponíveis na data ou no período, ofereça SEMPRE e EXCLUSIVAMENTE a lista de espera prioritária! NÃO sugira opções diferentes e NÃO pergunte "O que você prefere?". Todos devem ser direcionados para a lista de espera.
- REGRA DE OURO DE TRATAMENTO: NUNCA diga "o médico", "o profissional" ou "a médica" de forma genérica e impessoal! Refira-se SEMPRE ao profissional pelo seu nome real (${doctorInfo.name}) e especialidade (${doctorInfo.specialty}). Ex: "A agenda da ${doctorInfo.name}...", "Assim que o(a) ${doctorInfo.name} liberar novas datas...".
- LEMBRETE DE OURO: Se o interlocutor estiver agendando para um familiar (filho, cônjuge, mãe/pai idoso), mantenha SEMPRE o diálogo e o tratamento com o Interlocutor (${interlocutorName}) e refira-se ao paciente na 3ª pessoa!`;

      // Evita duplicar a última mensagem do usuário caso ela já esteja presente no fim do histórico
      const cleanHistory = [...conversationHistory];
      if (
        cleanHistory.length > 0 &&
        cleanHistory[cleanHistory.length - 1].role === 'user' &&
        cleanHistory[cleanHistory.length - 1].content.trim() === userMessage.trim()
      ) {
        cleanHistory.pop();
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemContent,
        },
        ...cleanHistory.map((msg) => ({
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

          if (toolName === 'buscar_consulta_atual' && !toolArgs.telefone_paciente && !toolArgs.nome_paciente && !toolArgs.cpf_paciente) {
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
