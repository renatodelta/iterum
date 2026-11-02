---
name: padrao-do-projeto
description: >-
  Use esta skill ao criar ou alterar qualquer código do Iterum (telas, componentes, rotas
  de API, banco Prisma, textos, commits). Garante o mesmo estilo, estrutura de pastas, idioma e
  cuidados de segurança do projeto. Também serve para explicar o projeto a quem é iniciante.
---

# Padrão do projeto Iterum

Sistema de **secretária virtual inteligente com atendimento 24 horas** (a assistente virtual "Sofia"): painel web + atendimento automatizado por WhatsApp.

> [!IMPORTANT]
> **Diretriz de Escopo do Projeto:**
> Esta aplicação foi concebida e está sendo desenvolvida especificamente para **gerenciar e automatizar a agenda de um médico** (consultório individual / profissional autônomo que lida com a agenda pessoalmente ou precisa contratar alguém para fazê-lo).
> - **Proposta central:** ser a **secretária virtual 24h** do médico, atendendo os pacientes dia e noite com humanização, tirando dúvidas, agendando, remarcando e encaixando em desistências.
> - **Apenas futuramente** o sistema poderá ser expandido para atender clínicas multi-profissionais e multi-médicos. No momento atual, toda a comunicação, interface, regras e mensagens devem refletir o contexto de um **médico e seu consultório**.


## Stack

- **Next.js 14** (App Router, pasta `app/`) + **React 18** + **TypeScript**
- **Tailwind CSS 3** + ícones **lucide-react**; datas com **date-fns**
- **Prisma 5** + **PostgreSQL** (variável `STORAGE_DATABASE_URL`); cliente único em
  [prisma.ts](../../../lib/prisma.ts)
- IA: **OpenAI** e **Gemini** (`lib/ai/`), filas **Upstash QStash/Redis** (`lib/queue.ts`)
- Hospedagem: **Vercel** (variáveis na Vercel; mudou variável → Redeploy)
- Ambiente local: Windows + XAMPP (`c:\xampp\htdocs\iterum`), terminal PowerShell

## Estrutura de pastas

| Pasta | O que vai aqui |
|---|---|
| `app/` | Páginas (`page.tsx`) e rotas de API (`app/api/<recurso>/route.ts`) |
| `components/<area>/` | Componentes React por área (`dashboard`, `calendar`, `whatsapp`) |
| `lib/` | Lógica reutilizável (`ai/`, `whatsapp/`, `queue.ts`, `prisma.ts`, ...) |
| `prisma/` | `schema.prisma`, seeds |
| `scripts/` | Utilitários pontuais |
| `.agents/skills/` | Skills do agente (esta pasta) |

## Convenções de código

1. **TypeScript** em tudo; imports com alias `@/` (ex.: `@/lib/prisma`).
2. **Rotas de API:** `route.ts` exportando `GET`/`POST`/...; usar `NextResponse.json(...)`;
   `export const dynamic = 'force-dynamic'` quando depende de dados do banco ou de request;
   envolver em `try/catch` e devolver `{ error: '...' }` com status adequado.
3. **Componentes:** nome em PascalCase, um por arquivo, `'use client'` apenas se usar estado/efeitos/
   eventos do navegador. Componentes nomeados (`export function Nome`) ou `export default` seguindo
   o arquivo vizinho.
4. **Prisma:** campos em camelCase no código com `@map("snake_case")` no banco e
   `@@map("tabela_plural")`; IDs `String @id @default(uuid())`; sempre `createdAt`/`updatedAt` quando
   fizer sentido. Telefones guardados em **E.164** (`+5511999999999`).
5. **Tailwind:** classes utilitárias direto no JSX (sem CSS novo se der para evitar); cor da marca
   `brand-*` (tailwind.config.js); o painel usa tons de verde (`#005a43`, `#059669`) e cantos
   arredondados (`rounded-2xl`), com `transition active:scale-95` nos botões. Layout responsivo
   mobile-first (`sm:`).
6. **Logs:** `console.log`/`console.error` com prefixo e emoji no estilo atual
   (`📩 [Webhook WhatsApp]`, `❌ Erro ...`). Nunca logar tokens, chaves ou dados sensíveis.
7. **Comentários:** em português, explicando o "porquê". Preserve os comentários e docstrings
   existentes que não tenham a ver com a mudança.
8. **Mudanças pequenas e focadas:** não refatore o que não foi pedido.

## Idioma e textos

- **Toda a interface, mensagens ao paciente, erros mostrados ao usuário e comentários em
  português do Brasil (pt-BR).**
- Nomes de variáveis, funções e arquivos em **inglês** (como já está no código); termos do
  domínio podem ficar em português quando já existem (ex.: status `AGENDADO`, `CONFIRMADO`,
  `CANCELADO`, `REMARCADO`).
- Tom das mensagens da Sofia: acolhedor, claro e curto; emojis com moderação.
- Datas e horários exibidos em formato brasileiro (`dd/MM/yyyy`, `HH:mm`), fuso America/Sao_Paulo.

## Segurança (obrigatório)

- **Nunca** colocar segredos em código, `.env.example`, `.txt`, `.md` ou commits. Exemplos em
  `.env.example` são sempre placeholders (`seu-token-aqui`).
- Segredos reais: somente `.env` (ignorado pelo Git) e variáveis da Vercel.
- Não incluir token em URL de remote do Git.
- Não commitar bancos locais (`*.db`) nem arquivos com credenciais.
- Dados de pacientes são sensíveis (LGPD): minimize o que é exibido e logado.
- Para a integração do WhatsApp, siga a skill **whatsapp-meta**.

## Como validar uma mudança

1. `npm run dev` e testar a tela/rota afetada no navegador (http://localhost:3000).
2. `npx tsc --noEmit` para checar tipos.
3. Mudou `schema.prisma`? `npx prisma generate` e `npx prisma db push` (⚠️ o script `build` usa
   `--accept-data-loss`: **nunca** rodar em produção sem entender o que será apagado).
4. Antes de publicar: `npm run build`.

## Git e commits

- Mensagens no padrão **Conventional Commits em português, sem acentos**, como no histórico:
  `fix(whatsapp): ...`, `feat(pacientes): ...`, `refactor(ai): ...`, `docs: ...`, `perf(...)`.
- Um commit por assunto.
- **Sempre que concluir modificações no código, gerar um commit descritivo e realizar o `git push` para a branch `main`.**
- Confira sempre com `git status` que `.env` e arquivos sensíveis **não** estão incluídos.

## Ao explicar para o usuário

O usuário é **iniciante**: use linguagem simples, explique termos técnicos na primeira vez que
aparecerem, diga o que vai fazer antes de fazer e como ele pode conferir o resultado.
