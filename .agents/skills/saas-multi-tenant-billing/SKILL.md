---
name: saas-multi-tenant-billing
description: >-
  Use esta skill ao planejar, desenvolver ou alterar funcionalidades comerciais do SaaS Iterum:
  arquitetura multi-tenant, planos de assinatura, limites de uso (cotas de WhatsApp, armazenamento, pacientes),
  gestão de custos de IA/infraestrutura e expansão da base de clientes médicos.
---

# SaaS Multi-Tenant e Modelo de Negócio do Iterum

Esta skill orienta as decisões de arquitetura e código para manter o SaaS Iterum economicamente viável, escalável e seguro ao crescer de dezenas para centenas de médicos assinantes.

---

## 1. Princípios de Arquitetura Multi-Tenant

1. **Separação Lógica de Dados:**
   - Base de dados única compartilhada (PostgreSQL gerenciado na Vercel/Supabase).
   - O particionamento lógico é feito pela chave estrangeira `clinicId` presente em todas as tabelas transacionais (`Appointment`, `Patient`, `Waitlist`, `WhatsAppMessage`, etc.).
2. **Identidade do Profissional por Tenant:**
   - O nome que o paciente enxerga no WhatsApp é o **Nome do profissional** configurado nas preferências da clínica.
   - Cada médico possui seus horários de atendimento, regras de intervalo e durações de consulta próprias.

---

## 2. Controle de Consumo e Custos Operacionais

Para manter a alta margem de lucro por médico (ex.: mensalidades de R$ 190 a R$ 390 por consultório):

### A. WhatsApp Meta Cloud API:
- Mensagens iniciadas pelo paciente (dentro da janela de 24h de serviço) possuem menor custo ou gratuidade nas cotas da Meta.
- Modelos de mensagem (*Utility Templates*) devem ser utilizados para lembretes de consulta 24h antes e encaixes de desistência.
- O sistema deve auditar a quantidade de disparos mensais por consultório para evitar abusos ou disparos em massa não autorizados.

### B. Consumo de Inteligência Artificial (LLMs):
- **Modelo Leve para Triagem/Chat:** Preferir modelos rápidos e com custo reduzido (ex.: `gpt-4o-mini` ou `gemini-1.5-flash`) para responder dúvidas cotidianas e agendamentos no WhatsApp.
- **Cache de Instruções e Contexto:** O prompt do sistema deve ser otimizado para evitar reenvio de dados desnecessários a cada turno de mensagem.
- **Histórico Rotativo:** Enviar apenas as mensagens recentes (janela deslizante) para não inflar a contagem de tokens de entrada.

---

## 3. Diretrizes para Criação de Novos Recursos

- **Compatibilidade Retroativa:** Nunca quebre a agenda ou o atendimento dos médicos ativos ao lançar uma nova funcionalidade.
- **Configurabilidade por Consultório:** Se uma clínica não quiser usar fila de espera ou lembretes automáticos, o recurso deve poder ser ativado/desativado de forma granular nas configurações do consultório.
- **Migrations Seguras:** Alterações no schema Prisma devem sempre ter valores padrão (`@default`) para colunas novas, prevenindo erros em linhas existentes no banco de dados.
