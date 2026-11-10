---
name: lgpd-e-seguranca-medica
description: >-
  Use esta skill sempre que for criar, alterar ou auditar rotas de API, tabelas do banco de dados,
  consultas Prisma, exportações de relatórios ou regras de mensagens que envolvam dados pessoais de pacientes
  (CPF, telefone, histórico de consultas, prontuário) e médicos. Garante conformidade com a LGPD
  e com as resoluções de sigilo médico do CFM.
---

# LGPD e Segurança de Dados em Saúde no Iterum

Esta skill estabelece as regras mandatórias de privacidade, segurança da informação e conformidade legal com a **Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018)** e as normativas do **Conselho Federal de Medicina (CFM)** aplicadas ao SaaS Iterum.

---

## 1. Princípio do Multi-Tenancy Seguro (Isolamento de Dados)

No Iterum, cada médico/consultório é um *tenant* independente identificado por `clinicId` (ou `doctorId`).

> [!CAUTION]
> **Risco Crítico de Vazamento:** Sob nenhuma hipótese um médico pode visualizar, pesquisar ou ter acesso a pacientes, agendamentos, relatórios ou mensagens de outro consultório.

### Regras Mandatórias no Prisma:
- **Toda consulta `findMany`, `findFirst`, `update`, `delete` e `count` DEVE conter explicitamente o filtro de `clinicId`:**
  ```typescript
  // CORRETO:
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId: session.clinicId,
      date: targetDate,
    },
  });

  // NUNCA FAÇA ISSO (Vazamento entre consultórios):
  const appointments = await prisma.appointment.findMany({
    where: { date: targetDate },
  });
  ```
- Ao criar registros (pacientes, consultas, mensagens), certifique-se de que o `clinicId` venha da sessão autenticada do usuário, e **nunca** de um campo mutável enviado livremente pelo corpo da requisição sem validação.

---

## 2. Tratamento de Dados Pessoais Sensíveis de Saúde

Dados de saúde são classificados como **dados sensíveis** (Art. 11 da LGPD).

### A. Prontuários e Anotações Clínicas:
- Observações médicas e históricos de atendimento não devem ser expostos via APIs públicas ou sem autenticação de nível de médico/secretária autorizada.
- Não envie conteúdos clínicos ou hipóteses de diagnóstico em mensagens automáticas de WhatsApp enviadas a pacientes. Mensagens de WhatsApp devem se ater a:
  - Lembrete de data, hora e local;
  - Confirmação de presença;
  - Instruções de preparo pré-consulta (ex.: jejum de 8h, trazer exames anteriores);
  - Felicitações de aniversário ou avisos de vaga disponível na fila de espera.

### B. Mascaramento e Exibição de Dados (Privacy by Design):
- **CPF:** Em telas públicas ou compartilhadas, exiba mascarado (ex.: `***.123.456-**`).
- **Telefone:** Mantenha a validação estrita com DDI (+55) e DDD, garantindo que o número correto receba a mensagem e não haja disparo a destinatários errados.
- **Logs de Servidor (Vercel e Console):** Nunca imprima em `console.log` o payload completo com CPF, telefone ou prontuário em ambiente de produção. Utilize identificadores internos (ex.: `patientId: pat_123`).

---

## 3. Comunicação via WhatsApp e Consentimento (Opt-in / Opt-out)

1. **Base Legal para Contato:**
   - O agendamento e a confirmação de presença enquadram-se na *Execução de Contrato ou Procedimentos Preliminares* e *Tutela da Saúde*.
2. **Direito de Revogação (Opt-out):**
   - Caso um paciente informe que não deseja mais receber lembretes ou mensagens automáticas, o sistema deve prever a desativação de notificações (`notificationOptOut: true`).
3. **Revogação e Sigilo de Credenciais:**
   - Tokens de acesso da Meta Cloud API e chaves de banco nunca devem ser commitados no Git ou gravados em texto claro nos clientes de front-end.
