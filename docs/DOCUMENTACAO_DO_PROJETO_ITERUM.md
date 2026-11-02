# ITERUM — DOCUMENTAÇÃO DO PROJETO

**Visão • Requisitos • Regras de Negócio • Arquitetura Técnica • Cronograma • Critérios de Aceite**  
*Versão 1.1 | 01 de novembro de 2026*  
*Documento-base para construção, validação, operação e evolução da plataforma*

---

## Como utilizar este documento

Este documento consolida o entendimento integral do projeto **Iterum**. Ele deve ser tratado como referência técnica e gerencial controlada: quando uma decisão mudar, registrar a alteração, a justificativa, a data e o impacto. Requisitos futuros não devem ser considerados aprovados apenas por estarem descritos como possibilidades.

**Legenda:**
- **APROVADO** = decisão confirmada e vigente no projeto.
- **PROPOSTO** = recomendação técnica ou de produto a validar.
- **PENDENTE** = definição ainda necessária antes da fase correspondente.

---

## Índice

1. [Identificação e controle do documento](#1-identificação-e-controle-do-documento)
2. [Sumário executivo](#2-sumário-executivo)
3. [Visão, missão e objetivos](#3-visão-missão-e-objetivos)
4. [Escopo do produto e modelo SaaS Multi-Tenant](#4-escopo-do-produto-e-modelo-saas-multi-tenant)
5. [Estrutura funcional e mapa da aplicação](#5-estrutura-funcional-e-mapa-da-aplicação)
6. [Requisitos funcionais](#6-requisitos-funcionais)
7. [Regras de negócio](#7-regras-de-negócio)
8. [Inteligência Artificial, Especialidades e Persona da Sofia](#8-inteligência-artificial-especialidades-e-persona-da-sofia)
9. [Identidade visual e experiência do usuário (UI/UX)](#9-identidade-visual-e-experiência-do-usuário-uiux)
10. [Arquitetura e especificações técnicas](#10-arquitetura-e-especificações-técnicas)
11. [Hospedagem, custos e infraestrutura](#11-hospedagem-custos-e-infraestrutura)
12. [Segurança, privacidade e conformidade com a LGPD](#12-segurança-privacidade-e-conformidade-com-a-lgpd)
13. [Desempenho, escalabilidade e observabilidade](#13-desempenho-escalabilidade-e-observabilidade)
14. [Cronograma de referência e marcos](#14-cronograma-de-referência-e-marcos)
15. [Entregáveis do projeto](#15-entregáveis-do-projeto)
16. [Testes e critérios de aceite](#16-testes-e-critérios-de-aceite)
17. [Gestão de mudanças, Git e versionamento](#17-gestão-de-mudanças-git-e-versionamento)
18. [Riscos, premissas e restrições](#18-riscos-premissas-e-restrições)
19. [Pendências para aprovação e próximas decisões](#19-pendências-para-aprovação-e-próximas-decisões)
20. [Aprovação e histórico de versões](#20-aprovação-e-histórico-de-versões)
- [Anexo A — Referências técnicas e institucionais](#anexo-a--referências-técnicas-e-institucionais)
- [Anexo B — Glossário](#anexo-b--glossário)

---

## 1. Identificação e controle do documento

- **Projeto:** Iterum
- **Documento:** Documento de Visão, Requisitos, Regras de Negócio, Arquitetura e Planejamento
- **Versão:** 1.1
- **Situação:** Baseline Oficial Atualizada (Suporte Multi-Tenant & Especialidade Médica Dinâmica)
- **Data:** 01 de novembro de 2026
- **Natureza:** Documento oficial de referência técnica, arquitetural, gerencial e apresentável a stakeholders, investidores e médicos clientes.

### 1.1 Objetivo deste documento
Registrar formalmente as decisões arquiteturais aprovadas, regras de negócio do consultório médico, matriz de requisitos funcionais e não-funcionais, engenharia de prompts da IA Sofia com suporte a especialidades dinâmicas (`specialty`), roteamento multi-tenant por número da Meta Cloud API, fluxo de filas assíncronas e critérios de aceite.

### 1.2 Convenções
- **APROVADO:** Decisão implementada ou confirmada em arquitetura.
- **PROPOSTO:** Melhoria recomendada com viabilidade mapeada.
- **PENDENTE:** Questão de negócio ou integração aguardando homologação externa.

---

## 2. Sumário executivo

O **Iterum** é uma plataforma inteligente de automação de recepção e gestão de agenda médica, projetada para atuar como uma **secretária virtual 24 horas** de alta fidelidade e humanização (personificada pela inteligência artificial **Sofia**).

A aplicação foi concebida para resolver a dor operacional de **médicos e consultórios individuais autônomos**, operando sob um modelo de **Software como Serviço (SaaS Multi-Tenant)**. Cada médico assinante possui seu próprio ambiente isolado, seu número oficial de WhatsApp comercial (Meta Cloud API), sua identidade institucional (foto, nome e CRM) e sua respectiva **Especialidade Médica** (*Pediatria, Cardiologia, Dermatologia, Ortopedia, etc.*).

A solução unifica:
1. **Atendimento Automatizado Multicanal via WhatsApp Oficial (Meta Cloud API):** Sofia atende os pacientes dia e noite, reconhece automaticamente a especialidade do médico contratante, tira dúvidas institucionais, checa horários livres, agenda consultas, gerencia cancelamentos, remarcações e aloca automaticamente desistências por fila de espera inteligente.
2. **Painel de Gestão e Cockpit Médico Web (Next.js 14):** Interface moderna, ergonômica e responsiva com calendário visual interativo, controle de pacientes, disparo de mensagens ativas e transbordo humano (*Human Handoff*).
3. **Fila de Espera Ativa com Encaixe Automatizado:** O sistema detecta o cancelamento de uma vaga e notifica de forma justa e cronometrada os pacientes que aguardavam por aquele período.

---

## 3. Visão, missão e objetivos

### 3.1 Visão do produto
Ser a infraestrutura padrão de secretária virtual inteligente para consultórios médicos no Brasil, permitindo que qualquer médico configure seu WhatsApp oficial em minutos e ofereça uma experiência de acolhimento empática, sem ruídos e pontual.

### 3.2 Missão
Capacitar o médico autônomo com uma assistente virtual de inteligência clínica e operacional disponível 24 horas por dia, 7 dias por semana, garantindo taxa de ocupação máxima na agenda, pontualidade e acolhimento impecável ao paciente.

### 3.3 Objetivos gerais
- Proporcionar agendamento e esclarecimento de dúvidas em menos de 2 minutos pelo WhatsApp.
- Reconhecer e respeitar a especialidade médica do consultório, orientando adequadamente queixas fora do escopo sem necessidade de mapeamentos manuais exaustivos.
- Reduzir as faltas a consultas (*no-show*) através de confirmações automatizadas programadas.
- Recuperar até 80% dos horários vagos provenientes de cancelamentos via lista de espera inteligente (*waitlist*).
- Manter isolamento multi-tenant seguro entre diferentes médicos e consultórios na mesma base.
- Garantir estrita conformidade com a LGPD e o sigilo médico ético.

### 3.4 Público-alvo
- **Primário:** Médicos que atuam em consultório particular/autônomo e buscam otimizar o tempo e reduzir despesas de recepção sem abrir mão do padrão humanizado.
- **Secundário:** Secretárias e recepcionistas físicas que operam em conjunto com a IA, utilizando o painel para monitorar agendamentos e intervir em atendimentos complexos.
- **Usuário Final:** Pacientes que buscam atendimento médico rápido, sem fricção de download de aplicativos ou menus telefônicos robotizados.

---

## 4. Escopo do produto e modelo SaaS Multi-Tenant

### 4.1 Escopo do MVP (Consolidado e Atualizado)
- **Estrutura SaaS Multi-Tenant:**
  - Cada médico/consultório possui seu registro (`Tenant` e `Clinic`) com especialidade médica definida (`specialty`), número oficial vinculado (`phoneNumberId`) e expediente exclusivo.
  - O roteamento de mensagens da Meta identifica o consultório de destino através do `phoneNumberId` da mensagem recebida, carregando instantaneamente o médico, a especialidade e a agenda corretos.
- **Painel Administrativo Web (Next.js 14 App Router):**
  - Autenticação com sessão segura (cookies HttpOnly) e controle de acesso baseado em papéis (`ADMIN`, `MEDICO`, `SECRETARIA`).
  - Visão geral com métricas diárias: total de consultas, confirmadas, pendentes, canceladas e atendimentos em andamento.
  - Calendário interativo de agendamentos com filtros por status e visualização diária/semanal/mensal.
  - Cadastro e histórico de pacientes (consultas, contatos e observações).
  - Gestão da Lista de Espera (*Waitlist*): registro de preferências de turno (manhã/tarde) e dias úteis.
  - Cockpit de Atendimentos WhatsApp com histórico em tempo real e botão de **Intervenção Humana (*Human Handoff*)**.
  - Configuração do consultório: expediente semanal, duração de slots, antecedência mínima de cancelamento e dados do profissional (CRM, endereço, especialidade).
- **Inteligência Artificial Sofia (OpenAI GPT-4o / Google Gemini):**
  - Contextualização dinâmica com o nome do médico e sua **Especialidade Principal**.
  - **Diretriz de Congruência Clínica:** a IA acolhe os sintomas informados e, se forem incompatíveis com o público/especialidade atendida (ex.: adulto com dor no pescoço em consultório de Pediatria), esclarece gentilmente a especialidade e orienta o paciente.
  - Orquestração de ferramentas (*Function Calling*) para: consultar horários livres, criar agendamento, cancelar, remarcar, incluir na fila de espera e acionar atendente humano.
  - Transcrição automática de áudios enviados pelos pacientes via Whisper.
- **Integração com WhatsApp Oficial (Meta Cloud API):**
  - Webhook com assinatura criptográfica (`x-hub-signature-256`).
  - Arquitetura de filas assíncronas com **Upstash QStash & Redis** para garantir processamento confiável e evitar reenvios da Meta.
  - Suporte a perfil personalizado na Meta (foto de jaleco do médico, nome comercial e biografia do consultório).

### 4.2 Fora do escopo do MVP (Fases Futuras)
- Prontuário eletrônico completo com prescrição médica digital integrada (CFM / ICP-Brasil).
- Clínicas multiprofissionais complexas com dezenas de salas simultâneas na mesma agenda (o foco é o médico individual e sua equipe).
- Processamento e cobrança direta de consultas por cartão/Pix na conversa.
- Aplicativo móvel nativo (iOS / Android), sendo o sistema web responsivo para mobile.

### 4.3 Evolução futura
- Integração nativa e bidirecional com Google Calendar / Apple Calendar.
- Módulo de faturamento TISS / convênios médicos.
- Onboarding automatizado via *Meta Embedded Signup* para conexão autônoma do número do médico pelo painel.
- Expansão da Sofia para ligações telefônicas com IA de voz em tempo real.

---

## 5. Estrutura funcional e mapa da aplicação

### 5.1 Navegação do Painel Web
- **`/login`:** Tela de login corporativo do médico e equipe com validação segura de credenciais.
- **`/` (Dashboard Principal):**
  - **Aba Visão Geral:** Cartões de indicadores rápidos, próximos atendimentos do dia e avisos de lista de espera.
  - **Aba Calendário:** Grade horária interativa, visualização de horários ocupados e formulário de agendamento manual.
  - **Aba Pacientes:** Tabela com busca rápida, histórico de consultas, dados cadastrais e link direto para WhatsApp.
  - **Aba Lista de Espera:** Painel de pacientes em espera, encaixes pendentes e status de aceitação.
  - **Aba Atendimentos WhatsApp:** Lista de conversas ativas, visualização de logs, pausar/retomar IA por paciente.
  - **Aba Configurações do Consultório:** Expediente semanal (dias, horários de início/fim e almoço), CRM, especialidade e duração de consulta.
  - **Aba Conexão WhatsApp:** Status da integração oficial Meta, WABA ID, Phone Number ID e teste de conexão.
- **`/agendamento`:** Página pública opcional de autoagendamento para o paciente.

### 5.2 Estrutura de Rotas de API (`/app/api`)
```
/api/auth/login                 -> Autenticação e geração de sessão segura
/api/auth/logout                -> Revogação de sessão
/api/auth/me                    -> Dados do usuário logado e permissões
/api/appointments               -> CRUD de agendamentos e listagens por data
/api/appointments/availability  -> Cálculo de slots livres conforme expediente
/api/appointments/book          -> Criação de agendamento validando conflitos
/api/appointments/cron-reminders-> Job periódico de lembrete e confirmação 24h/2h
/api/patients                   -> Gestão de pacientes
/api/patients/cron-birthday     -> Job para congratulações de aniversário
/api/waitlist                   -> Gestão da fila de espera e disparo de encaixes
/api/webhooks/whatsapp          -> Recepção e verificação de webhooks da Meta
/api/webhooks/whatsapp/worker   -> Processamento em background desacoplado da fila
/api/tenants/whatsapp           -> Configuração do token e número oficial Meta
/api/users                      -> Gestão de colaboradores e permissões
```

---

## 6. Requisitos funcionais

| ID | Requisito | Descrição | Prioridade / Fase |
|---|---|---|---|
| **RF-01** | Autenticação e RBAC | Login com e-mail/usuário, hash seguro e permissões diferenciadas (`ADMIN`, `MEDICO`, `SECRETARIA`). | APROVADO / MVP |
| **RF-02** | Gestão de Agenda | Exibir calendário, permitir agendamento, remarcação e cancelamento com bloqueio de conflitos. | APROVADO / MVP |
| **RF-03** | Configuração de Expediente | Personalizar horários de início, término, pausas de almoço e dias de atendimento. | APROVADO / MVP |
| **RF-04** | WhatsApp Oficial (Meta) | Recepção e envio de mensagens via Meta Cloud API com verificação de assinatura HMAC. | APROVADO / MVP |
| **RF-05** | Sofia: IA Conversacional | Atendimento 24h empático, claro, focado em agendamentos e contextualizado com a especialidade do médico. | APROVADO / MVP |
| **RF-06** | Roteamento Multi-Tenant | Identificar a clínica e o médico corretos a partir do `phoneNumberId` da mensagem recebida. | APROVADO / MVP |
| **RF-07** | Congruência de Especialidade | A Sofia utiliza o campo `specialty` do médico para responder queixas compatíveis e esclarecer delicadamente dúvidas fora do escopo. | APROVADO / MVP |
| **RF-08** | Function Calling de IA | Permitir à IA consultar vagas reais e agendar/cancelar diretamente no banco Prisma. | APROVADO / MVP |
| **RF-09** | Fila de Espera Inteligente (*Waitlist*) | Cadastrar pacientes interessados e oferecer vagas liberadas por cancelamentos. | APROVADO / MVP |
| **RF-10** | Transbordo Humano (*Human Handoff*) | Permitir pausar a IA de um paciente para que a secretária humana assuma o chat. | APROVADO / MVP |
| **RF-11** | Lembretes Automáticos | Disparar lembrete de consulta 24 horas e 2 horas antes com botões de confirmação. | APROVADO / MVP |
| **RF-12** | Cadastro de Pacientes | Centralizar dados em padrão brasileiro (CPF, telefone E.164, endereço e data de nascimento). | APROVADO / MVP |
| **RF-13** | Mensagem de Aniversário | Identificar aniversariantes do dia e disparar mensagem calorosa de felicitação em nome do médico. | APROVADO / MVP |
| **RF-14** | Transcrição de Áudio | Transcrever mensagens de voz recebidas no WhatsApp via Whisper antes do processamento da IA. | APROVADO / MVP |
| **RF-15** | Integração Google Calendar | Sincronização bidirecional em tempo real de eventos da agenda externa. | PROPOSTO / Fase 2 |
| **RF-16** | Pagamento Integrado (Pix) | Geração de cobrança automática da consulta ou sinal de agendamento. | PROPOSTO / Fase 2 |

---

## 7. Regras de negócio

- **RN-01 — Escopo Centrado no Consultório Médico Individual:** Todo o comportamento do sistema, respostas da IA e interface são desenhados para atender um médico autônomo e seu consultório. Apenas em fases futuras haverá suporte a clínicas multi-médicos com agendas cruzadas.
- **RN-02 — Conflito de Horário Estrito:** Não é permitido agendar duas consultas no mesmo intervalo de tempo (slot). A validação é atômica no banco de dados.
- **RN-03 — Política de Cancelamento e Remarcação:** Cancelamentos só são permitidos com antecedência mínima configurável (padrão de 2 horas antes da consulta).
- **RN-04 — Prioridade e Concorrência na Lista de Espera:** Quando um horário é cancelado, a vaga é oferecida primeiro ao paciente mais antigo que coincide com o turno/dia desejado. Se o paciente recusar ou expirar o tempo limite de resposta (ex: 30 minutos), a vaga é ofertada ao próximo da fila.
- **RN-05 — Preservação da Soberania Humana (Handoff):** Se o paciente solicitar explicitamente falar com um atendente ou se a IA detectar situação de urgência médica/dúvida clínica que foge do escopo de recepção, a IA é imediatamente silenciada para aquele paciente e o flag `humanHandoff` é ativado.
- **RN-06 — Não-Prescrição e Limite Ético Médico:** A IA Sofia está expressamente proibida pelo prompt de prescrever remédios, emitir diagnósticos clínicos ou dar orientações de dosagem. Situações emergenciais devem ser encaminhadas ao SAMU (192) ou pronto-socorro.
- **RN-07 — Congruência de Especialidade e Papo Furado:** A Sofia não tenta diagnosticar sintomas relatados pelo paciente, nem se perde em conversas cotidianas. Queixas fora da especialidade do médico contratante são esclarecidas com delicadeza, perguntando se o agendamento é para um dependente ou orientando o paciente a procurar a especialidade médica indicada.
- **RN-08 — Padronização Telefônica (E.164):** Todos os contatos de pacientes são normalizados no formato internacional (ex.: `+5511999999999`) para assegurar interoperabilidade com a Meta.
- **RN-09 — Isolamento e Proteção de Dados:** Credenciais de API da Meta, senhas e chaves são criptografadas e restritas ao ambiente de execução, nunca expostas no frontend.

---

## 8. Inteligência Artificial, Especialidades e Persona da Sofia

### 8.1 Persona e Tom de Voz da Sofia
- **Identidade:** Sofia, secretária virtual humana do Dr.(a) [Nome do Médico].
- **Tom:** Extremamente educada, prestativa, acolhedora, clara, objetiva e empática.
- **Estilo de Escrita:** Mensagens curtas e bem diagramadas, evitando blocos gigantescos de texto para facilitar a leitura no WhatsApp móvel. Uso pontual e elegante de emojis.
- **Segurança Operacional:** Nunca inventa horários disponíveis — sempre invoca a ferramenta `checkAvailability` antes de sugerir opções.

### 8.2 Diretriz de Especialidade Médica Dinâmica
A Sofia recebe a cada interação as seguintes diretrizes contextuais:
1. **Profissional e Especialidade:** Nome formatado do profissional e sua área de atuação (ex.: *Pediatria*, *Cardiologia*, *Dermatologia*).
2. **Tratamento de Queixas Clínicas:**
   - Acolher o desconforto com empatia.
   - Jamais emitir julgamento clínico ou prescrever remédios.
   - Se a queixa for claramente fora da especialidade do médico (ex.: adulto com dor cervical em consultório pediátrico), explicar o público do consultório e perguntar se a consulta é para um filho(a) ou familiar.

### 8.3 Matriz de Ferramentas da IA (Tools / Function Calling)
1. `buscar_horarios_disponiveis(data, periodo)`: Verifica slots vagos em um dia específico.
2. `buscar_proximos_horarios_disponiveis()`: Retorna os horários livres mais breves na grade.
3. `criar_novo_agendamento(data_hora, beneficiario_nome)`: Confirma o agendamento no banco.
4. `confirmar_remarcacao(agendamento_id, nova_data_hora)`: Realiza a troca de horário.
5. `cancelar_consulta(agendamento_id, motivo)`: Cancela a consulta e dispara gatilho da lista de espera.
6. `cadastrar_paciente(nome, nascimento, cep)`: Registra os dados obrigatórios do paciente antes de agendar.
7. `adicionar_fila_espera(nome, turno, dias)`: Insere o paciente na fila de vagas.
8. `transferir_para_humano(motivo)`: Notifica a equipe humana e suspende a automação.
9. `obter_informacoes_clinica()`: Consulta dados de endereço, especialidade e convênios.

---

## 9. Identidade visual e experiência do usuário (UI/UX)

A identidade visual do Iterum foi desenvolvida para transmitir autoridade médica, calma, higiene, acolhimento e sofisticação tecnológica.

### 9.1 Paleta de Cores Oficial
| Cor | Código Hex | Aplicação no Sistema |
|---|---|---|
| **Verde Médico Primário** | `#005A43` | Cabeçalhos, botões principais de ação e destaque institucional |
| **Verde Esmeralda** | `#059669` | Badges de status confirmados, sucesso e ícones de WhatsApp |
| **Cinza Neutro Claro** | `#F8FAFC` | Fundo das telas e superfícies dos cartões |
| **Bordas e Divisões** | `#E2E8F0` | Linhas de divisão de tabela, separadores e bordas |
| **Texto de Alto Contraste** | `#0F172A` | Títulos e corpo de texto principal |
| **Alerta / Cancelado** | `#DC2626` | Badges de cancelamento e ações destrutivas |

### 9.2 Princípios de Design e Usabilidade
- **Mobile-First e Totalmente Responsivo:** O médico pode acompanhar a agenda inteira e intervir no WhatsApp pelo próprio smartphone enquanto está entre consultas.
- **Feedback Tátil:** Botões com transições e animações de clique (`active:scale-95`).
- **Raio de Borda Ergonômico:** Cartões e modais com cantos suaves (`rounded-2xl`).

---

## 10. Arquitetura e especificações técnicas

### 10.1 Decisão Arquitetural Aprovada
A aplicação adota arquitetura moderna baseada em **Next.js 14 (App Router)** com execução serverless na **Vercel**, banco de dados relacional **PostgreSQL** orquestrado via **Prisma ORM**, filas resilientes com **Upstash QStash & Redis** e comunicação com LLMs de ponta (OpenAI e Gemini).

### 10.2 Matriz Tecnológica
| Camada | Tecnologia Adotada | Justificativa |
|---|---|---|
| **Framework Full-Stack** | Next.js 14 (App Router) + React 18 | Unificação de interface reativa e rotas de API serverless com TypeScript |
| **Linguagem** | TypeScript 5 | Tipagem estática rigorosa de ponta a ponta e prevenção de bugs em tempo de build |
| **Estilização** | Tailwind CSS 3 | Produtividade, consistência visual, ausência de CSS legado e bundle mínimo |
| **Banco de Dados** | PostgreSQL | Robustez transacional ACID, confiabilidade para agendamentos médicos |
| **ORM** | Prisma 5 | Schema declarativo, migrações controladas e cliente tipado de alta produtividade |
| **Orquestração de IA** | OpenAI API (GPT-4o) & Google Gemini | Alta acurácia em extração de entidades estruturadas e function calling |
| **Transcrição de Voz** | OpenAI Whisper API | Permite à Sofia escutar e responder mensagens de áudio dos pacientes |
| **Mensageria WhatsApp** | Meta Cloud API Oficial | Sem risco de banimento de número, velocidade e suporte a botões interativos |
| **Filas e Assincronismo**| Upstash QStash & Redis | Prevenção de timeouts de webhook, desacoplamento e retentativas automáticas |
| **Controle de Versão** | Git & GitHub | Rastreabilidade completa, branches protegidas e integração contínua (CI/CD) |

---

## 11. Hospedagem, custos e infraestrutura

### 11.1 Topologia de Hospedagem
- **Vercel (Hedge Serverless):** Hospeda o Next.js, as páginas estáticas e os endpoints da API com distribuição global em CDN edge.
- **PostgreSQL Gerenciado:** Banco de dados de alta disponibilidade hospedado em nuvem especializada (ex: Neon / Supabase).
- **Upstash:** Serverless Redis e QStash para buffer de mensagens da Meta.

### 11.2 Previsão de Custos Operacionais (Por Consultório)
| Recurso | Nível / Plano | Estimativa Mensal |
|---|---|---|
| **Vercel** | Hobby / Pro | U\$ 0,00 a U\$ 20,00 |
| **PostgreSQL Nuvem** | Tier gerenciado | U\$ 0,00 a U\$ 25,00 |
| **Upstash (Redis/QStash)** | Serverless Pay-as-you-go | U\$ 0,00 (dentro da cota gratuita para consultório individual) |
| **OpenAI / Gemini API** | Custo por token consumido | R\$ 15,00 a R\$ 40,00 / mês (conforme volume de pacientes) |
| **Meta WhatsApp API** | Primeiras 1.000 conversas gratuitas/mês | R\$ 0,00 para volume inicial de consultório padrão |

---

## 12. Segurança, privacidade e conformidade com a LGPD

- **Sigilo de Dados Médicos e LGPD:** O sistema armazena somente os dados indispensáveis para o agendamento (nome, telefone, data de nascimento e notas operacionais). Nenhum histórico de prontuário sigiloso é exposto a terceiros.
- **Criptografia em Trânsito e em Repouso:** Todo o tráfego opera exclusivamente sobre TLS/HTTPS. Senhas utilizam algoritmos modernos de hash salgado (PBKDF2/bcrypt/scrypt).
- **Validação de Webhooks da Meta:** Todas as requisições recebidas da Meta passam por verificação HMAC SHA-256 via cabeçalho `x-hub-signature-256`. Requisições não assinadas são rejeitadas imediatamente.
- **Proteção Contra Vazamentos no Git:** Segredos e chaves de produção ficam estritamente alocados no `.env` local e nas variáveis de ambiente seguras da Vercel. Regras de pre-commit e Git workflow impedem a inclusão de segredos no repositório.

---

## 13. Desempenho, escalabilidade e observabilidade

- **Desacoplamento por Fila:** O webhook do WhatsApp responde com status HTTP 200 à Meta em milissegundos após depositar a mensagem na fila, evitando que a Meta considere o webhook inativo durante o processamento do LLM.
- **Cache e Otimização de Consultas:** Informações do médico e consultório (`getDoctorInfo`) são cacheadas em memória por 5 minutos, garantindo resposta imediata.
- **Logs Estruturados:** Logs padronizados com identificadores visuais (`📩 [Webhook WhatsApp]`, `🤖 [Sofia]`, `❌ Erro`) facilitando a inspeção no console da Vercel ou ferramentas de observabilidade.

---

## 14. Cronograma de referência e marcos

| Fase / Marco | Descrição | Principais Entregáveis | Status |
|---|---|---|---|
| **M1 — Fundação do Projeto** | Setup de Next.js, Prisma, PostgreSQL, Docker/XAMPP local e autenticação. | Estrutura de rotas, schema relacional e tela de login. | APROVADO (Concluído) |
| **M2 — Cockpit e Agenda** | Desenvolvimento da UI do Dashboard, calendário de consultas e cadastro de pacientes. | Interface funcional com alternância de visão diária/semanal. | APROVADO (Concluído) |
| **M3 — WhatsApp Meta & Filas** | Conexão com a Meta Cloud API e implementação de filas Upstash QStash. | Webhook estável e comunicação bidirecional com WhatsApp. | APROVADO (Concluído) |
| **M4 — Inteligência Sofia & Ferramentas** | Orquestração do agente conversacional, function calling e fluxo de agendamento. | Sofia agendando e cancelando via chat natural. | APROVADO (Concluído) |
| **M5 — Fila de Espera & Especialidades** | Automação de encaixes, painel de handoff e injeção dinâmica de especialidade médica. | Recuperação de desistências e contexto clínico ativo. | APROVADO (Concluído) |
| **M6 — Homologação e Produção** | Testes de ponta a ponta, auditoria de segurança e deploy em produção na Vercel. | Plataforma rodando no domínio oficial do cliente. | PROPOSTO (Em andamento) |

---

## 15. Entregáveis do projeto

- **E-01 — Repositório de Código-fonte Git:** Versionado no GitHub com branches protegidas e histórico padronizado de commits.
- **E-02 — Painel Web do Consultório:** Dashboard administrativo completo para o médico e secretária.
- **E-03 — Agente Sofia (WhatsApp):** Assistente virtual 24h operando no número oficial do consultório com perfil comercial da clínica.
- **E-04 — Módulo de Recuperação de Vagas:** Algoritmo de notificação e realocação de consultas canceladas.
- **E-05 — Documentação Técnica e Manual do Usuário:** Manuais operacionais, documentação de API e guia para intervenção humana.
- **E-06 — Infraestrutura Serverless na Vercel e Banco de Dados em Nuvem.**

---

## 16. Testes e critérios de aceite

### 16.1 Critérios de Aceite da Plataforma
- O médico consegue visualizar seus compromissos no calendário em desktop e celular sem quebra de layout.
- Um paciente desconhecido que envia mensagem no WhatsApp é cadastrado automaticamente com seu nome e telefone normalizado.
- A Sofia apenas oferece horários que respeitam o expediente cadastrado e a duração do slot configurado na clínica.
- Queixas manifestamente incompatíveis com a especialidade do médico recebem esclarecimento educado sem dispersão.
- Ao ocorrer um cancelamento, o sistema notifica o primeiro paciente elegível da fila de espera em menos de 1 minuto.
- Quando o botão de intervenção humana é acionado no painel, a Sofia silencia imediatamente todas as respostas àquele paciente.

### 16.2 Roteiro Mínimo de Testes
1. Teste de concorrência para agendamento simultâneo do mesmo horário (verificação de consistência transacional).
2. Teste de validação de assinatura criptográfica nos webhooks da Meta.
3. Teste de resposta e timeout do LLM com fallback educado ao paciente.
4. Teste de áudio de voz no WhatsApp com transcrição Whisper.

---

## 17. Gestão de mudanças, Git e versionamento

Toda alteração de arquitetura, banco de dados ou escopo deve ser submetida a revisão e versionada:
- **Padrão de Commits:** Conventional Commits em português e sem acentos (`feat(...)`, `fix(...)`, `docs(...)`, `perf(...)`).
- **Fluxo de Deploy:** Commits validados e aprovados são enviados diretamente para a branch `main` (`origin main`), disparando o build e deploy automatizado na Vercel.
- **Proteção de Segredos:** Checagem rigorosa de `git status` para impedir commits de arquivos `.env`, `*.db` ou relatórios contendo chaves privadas.

---

## 18. Riscos, premissas e restrições

### 18.1 Matriz de Riscos
| Risco | Impacto | Mitigação |
|---|---|---|
| **Instabilidade na API da Meta WhatsApp** | Interrupção temporária de mensagens | Implementação do buffer Upstash QStash com reprocessamento automático |
| **Alucinação do modelo de linguagem** | Agendamento de horário inexistente | Uso estrito de ferramentas deterministicas (*Function Calling*) com checagem no banco |
| **Queixas clínicas fora do escopo** | Confusão sobre o atendimento | Injeção dinâmica da especialidade do médico com diretriz explícita de congruência clínica |
| **Cancelamento em cima da hora** | Ociosidade do médico | Encaixe automatizado da lista de espera com notificação ágil |
| **Interrupção de internet no consultório** | Secretária sem acesso local | Sistema totalmente em nuvem, acessível por 4G/5G em qualquer smartphone |

### 18.2 Premissas do Projeto
- Cada médico possui ou contratará um número comercial apto a ser vinculado à Meta Business Cloud API.
- O acesso ao painel é disponibilizado via navegadores modernos (Chrome, Safari, Edge, Firefox).
- A responsabilidade final pela conduta diagnóstica é exclusivamente do médico responsável.

### 18.3 Restrições
- Não haverá suporte no MVP a múltiplos médicos simultâneos compartilhando a mesma agenda com salas cruzadas.
- A personalização de foto de perfil e nome de exibição do WhatsApp do médico é gerenciada diretamente no Gerenciador do WhatsApp da Meta.

---

## 19. Pendências para aprovação e próximas decisões

- Homologação do fluxo de integração autônoma (*Embedded Signup*) para que novos médicos conectem seus números pelo próprio painel.
- Definição do prazo exato de tolerância (em minutos) para o paciente da lista de espera responder antes de passar para o próximo.
- Definição do domínio final para o painel web (ex: `app.iterum.med.br` ou domínio customizado da clínica).
- Configuração de fallback via SMS para pacientes com instabilidade de dados móveis no WhatsApp.

---

## 20. Aprovação e histórico de versões

### 20.1 Registro de Versão
| Versão | Data | Responsável | Resumo das Alterações |
|---|---|---|---|
| **1.0** | 31/10/2026 | Equipe Técnica Iterum | Consolidação inicial de visão, escopo, requisitos, regras de negócio, arquitetura e planejamento. |
| **1.1** | 01/11/2026 | Equipe Técnica Iterum | Atualização para modelo SaaS Multi-Tenant, injeção dinâmica de Especialidade Médica (`specialty`), diretriz de congruência clínica da Sofia e transcrição de áudio. |

### 20.2 Termo de Homologação e Aceite

Este documento representa a baseline oficial de requisitos, arquitetura e regras de negócio do sistema **Iterum**.

**Responsável Técnico pelo Projeto:** ______________________________________________  
**Aprovador / Cliente:** ___________________________________________________________  
**Data de Aprovação:** ______ / ______ / 2026

---

## Anexo A — Referências técnicas e institucionais

- **Documentação Next.js:** https://nextjs.org/docs
- **Documentação Prisma ORM:** https://www.prisma.io/docs
- **Guia Oficial da Meta Cloud API (WhatsApp):** https://developers.facebook.com/docs/whatsapp/cloud-api
- **Documentação Upstash QStash & Redis:** https://upstash.com/docs
- **Conselho Federal de Medicina (CFM) — Normas de Telemedicina e Sigilo:** https://portal.cfm.org.br/
- **Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018):** http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm

---

## Anexo B — Glossário

| Termo | Definição |
|---|---|
| **Iterum** | Nome da plataforma de gestão e automação de secretária virtual médica. |
| **Sofia** | Personificação da assistente virtual com inteligência artificial que atende os pacientes no WhatsApp. |
| **SaaS Multi-Tenant** | Arquitetura onde uma única aplicação atende múltiplos médicos/clientes de forma segura e com dados isolados. |
| **Specialty** | Especialidade médica principal cadastrada pelo médico, utilizada pela Sofia para direcionar conversas. |
| **Slot** | Intervalo fixo de tempo reservado na agenda para uma consulta (ex.: 30 ou 60 minutos). |
| **Waitlist** | Fila de espera de pacientes aguardando desistências de consultas em horários concorridos. |
| **Human Handoff** | Mecanismo que pausa a IA e transfere o atendimento a um operador humano quando solicitado ou em casos complexos. |
| **Meta Cloud API** | API oficial disponibilizada pela Meta para tráfego seguro de mensagens corporativas no WhatsApp. |
| **QStash** | Fila de mensageria assíncrona serverless que garante a entrega de requisições de webhooks mesmo com picos de tráfego. |
| **Prisma ORM** | Mapeador objeto-relacional para Node.js/TypeScript que faz a ponte estruturada com o banco de dados PostgreSQL. |
| **No-show** | Termo que designa a falta do paciente à consulta sem aviso prévio. |
