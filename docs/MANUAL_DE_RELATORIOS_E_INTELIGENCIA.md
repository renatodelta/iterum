# Manual de Inteligência e Relatórios do Consultório

Este documento detalha a arquitetura, objetivos de negócio, fórmulas e explicação de todas as métricas da central de **Inteligência e Relatórios** do Iterum.

---

## 1. Visão Geral e Proposta de Valor

A central de Inteligência e Relatórios do Iterum foi projetada com um foco estratégico: **entregar valor executivo direto ao médico titular**, fugindo de relatórios burocráticos, lentos ou em formato de planilhas complexas.

O objetivo central é responder às duas principais perguntas de quem gere um consultório particular:
1. **Qual é o retorno financeiro real (ROI) que a assistente virtual Sofia está gerando para o meu consultório?**
2. **Como está o aproveitamento da minha agenda e onde estão os gargalos de ociosidade e evasão de pacientes?**

---

## 2. Retorno sobre Investimento da Sofia (Inteligência Artificial)

O card principal de destaque no topo da tela traduz o trabalho da IA em **impacto financeiro direto e mensurável**.

```
┌────────────────────────────────────────────────────────────────────────┐
│  RETORNO SOBRE INVESTIMENTO DA SOFIA (INTELIGÊNCIA ARTIFICIAL)         │
│  Receita Protegida e Gerada: R$ [Valor]                                │
│                                                                        │
│  [ Fora do Expediente ]   [ Salvas na Fila ]   [ Autonomia da IA ]     │
│       XX consultas            YY vagas               ZZ%               │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Receita Protegida e Gerada
* **O que é:** O valor financeiro total gerado ou salvo exclusivamente pela atuação da Sofia no período selecionado.
* **Fórmula de cálculo:**  
  $$\text{Receita Protegida} = (\text{Consultas Fora do Expediente} + \text{Vagas Salvas na Fila}) \times \text{Ticket Médio}$$
* **Por que importa:** Mostra de forma irrefutável que a assinatura do sistema se paga com folga logo nos primeiros dias do mês.

### 2.2. Ticket Médio por Consulta
* **O que é:** O valor médio cobrado por uma consulta particular no consultório (padrão sugerido de R$ 350,00).
* **Personalização:** O médico ou gestor pode clicar diretamente sobre o valor na tela e alterar para a sua realidade (ex: R$ 400, R$ 500 ou R$ 600), recalculando todas as projeções em tempo real.

### 2.3. Agendamentos Fora do Expediente Comercial
* **O que é:** Quantidade de consultas marcadas pela Sofia em momentos em que a secretária humana não está trabalhando:
  - De segunda a sexta-feira: antes das 08h da manhã ou após as 18h da noite.
  - Sábados, domingos e feriados em qualquer horário.
* **Impacto clínico:** O paciente que busca atendimento à noite ou no final de semana frequentemente agenda com o primeiro consultório que o acolhe de imediato. Sem a IA, esse paciente procuraria outro profissional ou deixaria para depois e desistiria.

### 2.4. Vagas Resgatadas pela Fila de Espera
* **O que é:** Horários que seriam perdidos por cancelamentos de última hora e que a Sofia preencheu de forma instantânea disparando notificações prioritárias para os pacientes cadastrados na Fila de Espera.
* **Impacto clínico:** O cancelamento em cima da hora é a maior causa de ociosidade e perda de faturamento na medicina particular. Cada vaga preenchida pela fila é receita resgatada que iria para o ralo.

### 2.5. Taxa de Autonomia da IA e Horas Economizadas
* **O que é:** Percentual de conversas no WhatsApp resolvidas 100% de ponta a ponta pela Sofia sem a necessidade de intervenção humana (geralmente entre 88% e 96%).
* **Horas Economizadas da Recepção:** Cada atendimento telefônico ou troca de mensagens manual para agendamento consome cerca de 8 a 10 minutos da equipe. A Sofia poupa dezenas de horas mensais da secretária, liberando-a para acolher com carinho quem está fisicamente na sala de espera.

---

## 3. Métricas Clínicas e Gestão de Agenda

Este módulo consolida o volume operacional de atendimentos e a eficiência do processo de agendamento.

### 3.1. Total de Consultas e Detalhamento de Status
* **Consultas Ativas:** Soma de agendamentos futuros garantidos e consultas já realizadas.
* **Confirmadas:** Consultas em que o paciente respondeu positivamente ao lembrete de véspera (D-1).
* **Canceladas:** Horários desmarcados no período (com liberação automática de vaga para a fila).
* **Remarcadas:** Consultas que foram transferidas de dia ou horário pela solicitação do paciente.

### 3.2. Taxa de Confirmação de Presença (Combate ao No-Show)
* **O que é:** Percentual de consultas ativas cuja presença foi confirmada através do lembrete automático disparado pela Sofia na véspera da consulta:
  $$\text{Taxa de Confirmação} = \frac{\text{Confirmadas} + \text{Realizadas}}{\text{Consultas Ativas}} \times 100$$
* **Impacto clínico:** Garante previsibilidade para o médico saber com exatidão quem realmente comparecerá ao consultório no dia seguinte.

### 3.3. Taxa de Ocupação da Grade
* **O que é:** Percentual de aproveitamento da capacidade teórica total configurada no expediente do consultório:
  $$\text{Taxa de Ocupação} = \frac{\text{Consultas Ativas}}{\text{Capacidade Teórica de Vagas no Período}} \times 100$$
* **Fórmula de Capacidade Teórica:** O sistema lê os dias ativos de atendimento na semana, os horários de início e término, o intervalo de almoço e a duração padrão de cada consulta (ex: 30 ou 45 minutos) para calcular exatamente quantas vagas a clínica ofereceu no período.

### 3.4. Faturamento Estimado Geral
* **O que é:** Projeção da receita bruta do consultório no período selecionado, multiplicando o volume de consultas ativas pelo ticket médio estipulado.

---

## 4. Ocupação e Ociosidade por Dia da Semana e Turnos

Este módulo oferece visão analítica para o médico ajustar estrategicamente sua grade de atendimento.

### 4.1. Gráfico de Ocupação por Dia da Semana
* **O que mostra:** O percentual de preenchimento da agenda para cada dia útil (Segunda a Sábado).
* **Código de Cores Inteligente:**
  - **Verde escuro ($\ge$ 80%):** Dias de alta procura e agenda cheia.
  - **Teal / Azul petróleo (50% a 79%):** Dias com demanda saudável e equilibrada.
  - **Âmbar / Laranja (< 50%):** Dias com alto índice de ociosidade.
* **Tomada de Decisão:** Permite ao profissional concentrar atendimentos nos dias mais nobres ou, caso deseje folga/viagem para congressos, optar pelos dias que historicamente geram menor movimento.

### 4.2. Distribuição por Turno (Manhã e Tarde)
* **O que mostra:** A divisão proporcional entre pacientes atendidos pela manhã (até 12h) e à tarde (após 12h).
* **Importância:** Útil para saber se o público-alvo tem preferência por turnos específicos (ex: mães que preferem o turno da tarde em pediatria para não coincidir com o horário escolar matutino).

---

## 5. Retenção de Pacientes e Renovação de Carteira

Um consultório sustentável depende do equilíbrio entre a atração de novos pacientes e o acompanhamento contínuo dos pacientes já fidelizados.

### 5.1. Pacientes Novos vs. Pacientes Recorrentes
* **Pacientes Novos:** Pacientes que nunca haviam consultado com o médico antes da data inicial do período.
* **Pacientes Recorrentes:** Pacientes que já possuíam histórico prévio e retornaram para novas consultas ou acompanhamentos de rotina.
* **Parâmetro de Mercado:** Consultórios particulares maduros mantêm entre **40% e 60%** de pacientes recorrentes em acompanhamento contínuo.

### 5.2. Radar de Reativação de Pacientes Inativos
* **Critério de Inatividade:** Pacientes cadastrados na clínica cuja última consulta realizada ocorreu há **mais de 6 meses (180 dias)**.
* **Oportunidade Clínica:**
  - Em **Pediatria**, consultas de rotina (puericultura) e acompanhamento de vacinas são periódicas.
  - Em **Ginecologia**, exames preventivos anuais.
  - Em **Clínica Geral e Cardiologia**, exames de check-up e controle pressórico/laboratorial semestral.
* **Ação em 1 Clique:** A tela lista os pacientes inativos com a data do último atendimento, quantos dias estão sem consultar e um botão verde **"Reativar no WhatsApp"**, que abre diretamente uma conversa no WhatsApp com uma mensagem acolhedora pré-formatada convidando o paciente para o seu acompanhamento de rotina.

---

## 6. O Fechamento Executivo no WhatsApp do Médico

O grande diferencial de experiência para o médico titular da agenda é a facilidade de receber o fechamento do consultório diretamente no seu próprio celular.

### 6.1. Como Funciona o Disparo
1. No topo da tela de Inteligência e Relatórios, o médico ou operador clica no botão **"Enviar p/ WhatsApp do Médico"**.
2. Uma janela modal é aberta exibindo o telefone de destino (carregado automaticamente do cadastro profissional do médico titular).
3. A prévia da mensagem é exibida com formatação nativa do WhatsApp (usando apenas um asterisco para negrito, sem resíduos visuais e sem o caractere "&").
4. Ao clicar em **"Disparar Resumo Agora"**, a API despacha a mensagem imediatamente pela infraestrutura oficial da Meta.

### 6.2. Exemplo da Mensagem Recebida no Celular do Médico
```text
Fechamento Executivo do Consultório 🩺
Olá, Dra. Silvia Helena Lima de Andrade! Aqui está o resumo consolidado de desempenho da sua agenda médica (deste mês):

📊 Desempenho da Agenda:
• Total de consultas ativas: 112
• Faturamento estimado: R$ 39.200,00

🤖 Impacto da Sofia (Inteligência Artificial):
• Agendamentos fora do expediente: 38 consultas (noites e finais de semana)
• Vagas resgatadas pela Fila de Espera: 9 horários salvos
• Receita protegida pela IA: R$ 16.450,00

Sua secretária virtual cuidou de todos os agendamentos e lembretes com excelência. Tenha um excelente trabalho! ✨
```

---

## 7. Exportação e Impressão em PDF

A página conta com suporte nativo a impressão e geração de relatórios físicos ou digitais:
* Ao clicar no botão **"Imprimir"**, o sistema ativa os estilos de impressão CSS (`@media print`), ocultando botões de navegação, cabeçalhos do sistema e menus laterais.
* O documento gerado é limpo e formatado em página A4, pronto para ser anexado a relatórios contábeis, prestação de contas de sócios ou salvo como PDF.

---

## 8. Filtros de Período Disponíveis

| Filtro | Descrição da Janela Temporal |
| :--- | :--- |
| **7 Dias** | Últimos 7 dias corridos a partir da data atual. |
| **Este Mês** | Do primeiro dia do mês corrente até hoje (filtro padrão). |
| **Mês Anterior** | Do primeiro ao último dia do mês imediatamente anterior (ideal para fechamento contábil). |
| **90 Dias** | Últimos 3 meses corridos (análise de trimestre). |
| **Ano** | Do primeiro dia de janeiro do ano atual até a data presente. |
