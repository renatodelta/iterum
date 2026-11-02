---
name: whatsapp-meta
description: >-
  Use esta skill quando o usuário falar de WhatsApp, Meta Cloud API, webhook, token da Meta,
  mensagens que não chegam ou não são respondidas, "a Sofia parou de responder", rotação/revogação
  de chaves, ou quando precisar reconfigurar a integração do WhatsApp do Iterum do zero
  (por exemplo, depois de revogar credenciais por segurança). Guia a configuração, o diagnóstico e a
  recuperação. Nunca contém segredos reais.
---

# Integração WhatsApp (Meta Cloud API) do Iterum

> [!IMPORTANT]
> **Regra de segurança:** nunca escreva tokens, chaves ou senhas reais em arquivos do projeto
> (inclui `.env.example`, `.txt`, `.md` e esta skill), no chat ou em commits. Os valores reais ficam
> **somente** no `.env` local (ignorado pelo Git) e nas *Environment Variables* da Vercel.

Se o usuário for iniciante, explique cada passo em português simples e peça que confirme o resultado
de cada etapa antes de seguir para a próxima.

## 1. Como o fluxo funciona

```text
Paciente (WhatsApp)
   │  1. envia mensagem
   ▼
Meta Cloud API ──(webhook POST)──► /api/webhooks/whatsapp   (Vercel)
                                       │ 2. extrai texto/áudio e dispara "digitando..."
                                       ▼
                         QStash (se QSTASH_TOKEN existir) ──► /api/webhooks/whatsapp/worker
                         ou execução direta                    │
                                                               ▼
                                          lib/whatsapp/processor.ts  (paciente, histórico, handoff)
                                                               ▼
                                          lib/ai/agent.ts  (IA "Sofia": OpenAI/Gemini + tools)
                                                               ▼
                                          lib/whatsapp/client.ts ──► Graph API ──► Paciente
```

Arquivos-chave:

| Arquivo | Papel |
|---|---|
| [route.ts](../../../app/api/webhooks/whatsapp/route.ts) | GET = verificação do webhook pela Meta; POST = recebe mensagens |
| [worker/route.ts](../../../app/api/webhooks/whatsapp/worker/route.ts) | Processa jobs vindos da fila (QStash) |
| [client.ts](../../../lib/whatsapp/client.ts) | Envio de mensagens, botões, "digitando", download de áudio |
| [processor.ts](../../../lib/whatsapp/processor.ts) | Fluxo completo de atendimento |
| [queue.ts](../../../lib/queue.ts) | Fila QStash / fallback fire-and-forget |
| [onboarding/route.ts](../../../app/api/tenants/whatsapp/onboarding/route.ts) | Conexão multi-clínica (Embedded Signup) |

## 2. Variáveis de ambiente (só os NOMES; valores nunca aqui)

| Variável | Para que serve | Onde pegar |
|---|---|---|
| `META_ACCESS_TOKEN` | Token para enviar mensagens | Meta Business → Usuários do sistema → Gerar token |
| `META_PHONE_NUMBER_ID` | ID do número remetente | Meta for Developers → WhatsApp → Configuração da API |
| `META_GRAPH_VERSION` | Versão da Graph API (ex.: `v21.0`) | Definida por nós |
| `VERIFY_TOKEN` | Senha que a Meta usa para validar o webhook | **Inventada por você**; igual na Vercel e no painel da Meta |
| `META_APP_ID` / `NEXT_PUBLIC_META_APP_ID` | ID do app (Embedded Signup) | Painel do app na Meta |
| `META_APP_SECRET` | Segredo do app (só servidor). **Obrigatório**: valida a assinatura dos webhooks | Meta → Configurações do app → Básico |
| `NEXT_PUBLIC_META_CONFIG_ID` | Config do Embedded Signup | Meta → Login para Empresas |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | IA que responde | Painéis da OpenAI / Google |
| `QSTASH_TOKEN` (opcional) | Fila assíncrona | Console da Upstash |
| `CRON_SECRET` | Protege cron e fila interna (mín. 16 caracteres; sem valor padrão) | Inventada por você |
| `WEBHOOK_SECRET` (opcional) | Header `x-webhook-secret` para provedores não-Meta | Inventada por você |
| `SESSION_SECRET` | Assina o cookie de login (mín. 32 caracteres) | Inventada por você |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD_HASH` | Administrador inicial (hash via `node scripts/hash-password.js`) | Definida por nós |
| `STORAGE_DATABASE_URL` | Banco PostgreSQL | Vercel Storage / provedor do banco |

Regras que já nos custaram tempo:

1. Valores na Vercel **sem aspas duplas**. (O código tenta limpar aspas, mas não conte com isso.)
2. Toda alteração de variável na Vercel exige **Redeploy** (aba *Deployments*) para valer.
3. Após mudar `VERIFY_TOKEN`, atualize **também** o campo "Verify token" no webhook da Meta.

## 3. Configurar do zero (ou depois de revogar tudo)

Faça uma etapa por vez e confirme cada uma com o usuário.

1. **App na Meta:** em developers.facebook.com, use o app com produto *WhatsApp* ativo
   (ou crie um do tipo *Business*).
2. **Token:**
   - *Teste:* o token temporário do painel expira em ~24 h.
   - *Produção:* business.facebook.com → Configurações do negócio → Usuários → **Usuários do sistema**
     → criar usuário → atribuir o app com controle total → **Gerar token** com as permissões
     `whatsapp_business_messaging` e `whatsapp_business_management` → validade **Nunca expira**.
3. **IDs:** copie `Phone Number ID` e `WABA ID` (WhatsApp → Configuração da API).
4. **Variáveis:** coloque `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_GRAPH_VERSION`,
   `VERIFY_TOKEN` (e as demais) na **Vercel** e no **.env** local. Faça **Redeploy**.
5. **Webhook:** WhatsApp → Configuração → Webhook:
   - URL de callback: `https://<URL-DA-VERCEL>/api/webhooks/whatsapp`
   - Verify token: o mesmo valor de `VERIFY_TOKEN`
   - Clique em *Verificar e salvar*; depois **assine o campo `messages`**.
6. **Inscrever o app na WABA (o "pulo do gato"):** sem isso a Meta não encaminha mensagens reais
   para a Vercel. Rode o script (ele pede o token de forma oculta):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .agents/skills/whatsapp-meta/scripts/diagnostico-meta.ps1 -WabaId <WABA_ID> -PhoneNumberId <PHONE_ID> -SubscribeApp
   ```
7. **Teste ponta a ponta:** mande uma mensagem do WhatsApp do usuário para o número da Meta e veja
   a resposta. No modo de teste, o número do paciente precisa estar na lista de destinatários
   permitidos do painel.

## 4. Diagnóstico: "as mensagens pararam"

Siga esta ordem, parando quando achar a causa:

| # | Verificação | Sintoma / causa provável | Correção |
|---|---|---|---|
| 1 | Rodar `diagnostico-meta.ps1` | Erro `190` / "Invalid OAuth access token" | Token expirado ou revogado → gerar novo, atualizar Vercel + Redeploy |
| 2 | Painel Meta → Webhook | Verificação falha / GET devolve 403 | `VERIFY_TOKEN` diferente entre Vercel e Meta, ou faltou Redeploy |
| 3 | Mensagens reais não chegam (só as de teste do painel) | App não inscrito na WABA | `diagnostico-meta.ps1 -SubscribeApp` |
| 4 | Campo `messages` do webhook | Não assinado | Assinar no painel do webhook |
| 5 | Logs da Vercel (*Logs* do projeto) | Procure `📩 [Webhook WhatsApp]` (chegou) e `❌ Erro Meta Cloud API` (falhou ao enviar) | Use o código/mensagem de erro da Meta |
| 6 | Chegou mas não responde | `OPENAI_API_KEY`/`GEMINI_API_KEY` inválida, ou paciente em *human handoff* | Trocar chave; paciente envia `/bot` para reativar a IA |
| 7 | Erro `131030` | Número do paciente fora da lista de teste | Adicionar na lista de destinatários no painel |
| 8 | Erro `131047` / `131026` | Janela de 24 h expirada / mensagem não entregável | Só template aprovado fora da janela |
| 9 | Usa fila e nada acontece | `QSTASH_TOKEN` inválido ou `APP_URL` errada | Corrigir token/URL; ou remover `QSTASH_TOKEN` para execução direta |
| 10 | Funciona local, não na Vercel | Variáveis só no `.env` local | Cadastrar na Vercel + Redeploy |

Observação: o antigo `?debug=env` da rota GET foi **removido** por segurança (vazava prefixo do token e IDs).
Para diagnosticar, use o `diagnostico-meta.ps1` e os logs da Vercel.

Segurança do webhook (obrigatório): o POST só é aceito se vier com a assinatura `X-Hub-Signature-256`
da Meta, validada com `META_APP_SECRET`. **Se `META_APP_SECRET` não estiver configurada na Vercel, o
webhook recusa tudo (403)** e as mensagens "param de chegar". Payloads de provedores alternativos
(Evolution/Z-API) só são aceitos com o header `x-webhook-secret` igual a `WEBHOOK_SECRET`.

## 5. Após revogar/rotacionar credenciais (checklist)

Marque cada item com o usuário:

- [ ] **Meta:** gerar novo token do usuário do sistema; revogar o antigo.
- [ ] **Meta:** se o *App Secret* vazou, redefinir em Configurações do app → Básico
      (atualizar `META_APP_SECRET`).
- [ ] **Verify token:** inventar um novo, mudar na Vercel **e** no painel do webhook.
- [ ] **Vercel:** atualizar `META_ACCESS_TOKEN` (+ demais), sem aspas → **Redeploy**.
- [ ] **Outras chaves que possam ter vazado:** `OPENAI_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`,
      `QSTASH_TOKEN`, URL do banco (`STORAGE_DATABASE_URL`) e senhas de usuários do sistema.
- [ ] **GitHub:** revogar tokens pessoais (PAT) antigos; a URL do `origin` não deve conter token
      (`git remote set-url origin https://github.com/<usuario>/<repo>.git`).
- [ ] **Histórico do Git:** remover segredos do histórico (ex.: `git filter-repo`) e fazer
      *force push*; considerar que o segredo antigo já está comprometido mesmo após a limpeza —
      por isso a **revogação vem primeiro**.
- [ ] **Teste final:** `diagnostico-meta.ps1` + mensagem real no WhatsApp.

## 6. Cuidados ao alterar código desta integração

- Mantenha o webhook respondendo `200` rápido (`EVENT_RECEIVED`); a Meta reenvia se demorar.
- O envio tem fallback: se botões interativos falham, reenvia como texto simples.
- Telefones: apenas dígitos para a API; formato E.164 (`+55...`) no banco.
- Nunca registre (`console.log`) tokens ou payloads com dados sensíveis de pacientes além do necessário.
- Valores de exemplo em `.env.example` devem ser sempre placeholders (`seu-token-aqui`).
