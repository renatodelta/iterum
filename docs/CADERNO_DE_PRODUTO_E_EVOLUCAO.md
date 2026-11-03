# CADERNO DE PRODUTO & EVOLUÇÃO DO ITERUM

**Guia Executivo, Decisões de Negócio e Manual Não Técnico de Funcionamento**  
*Linguagem clara para fundadores, parceiros, médicos e gestores*  
*Versão Atual: 1.0 | Data de Atualização: 03 de novembro de 2026*

---

## 🧭 O que é este documento?

Se você não é da área de TI (Tecnologia da Informação / Computação), este documento foi feito especialmente para você!

Aqui não usamos termos difíceis de programação nem códigos de tela preta. O objetivo deste **Caderno de Produto** é explicar em português simples:
1. **O que o Iterum faz na prática** no dia a dia do consultório;
2. **Como a assistente virtual Sofia se comporta** com os pacientes;
3. **O Diário de Bordo de Decisões:** por que cada funcionalidade foi decidida dessa forma e como ela funciona hoje.

Toda vez que uma nova regra ou decisão importante for combinada, ela será registrada aqui.

---

## 🏥 1. O que é o Iterum em poucas palavras?

O **Iterum** é a **secretária virtual inteligente do consultório médico**. 

Imagine uma secretária exemplar que:
* Nunca dorme, nunca tira férias e atende o WhatsApp dia e noite (24h/7d) em menos de 10 segundos;
* Fala de forma educada, acolhedora e com o calor humano de um consultório particular;
* Conhece a agenda do médico em tempo real e não marca duas pessoas no mesmo horário;
* Cuida dos dados do paciente (nome, aniversário, telefone);
* Não deixa horários vagos: quando alguém cancela, ela corre na **Lista de Espera** e oferece o horário para quem estava na fila.

E para o médico e a secretária física, existe um **Painel Web (no computador ou celular)** com um calendário visual onde é possível ver todos os pacientes do dia, confirmar presenças, remarcar horários ou assumir a conversa no WhatsApp a qualquer momento.

---

## 🤖 2. Quem é a Sofia e como ela se comporta?

A **Sofia** é a "pessoa" virtual que atende os pacientes no WhatsApp oficial da clínica.

### A) Tom de Voz e Estilo:
* Ela conversa como uma pessoa real: com carinho, empatia e cordialidade.
* **Sem menus chatos:** Ela nunca diz *"Digite 1 para agendar ou 2 para cancelar"*. O paciente escreve livremente: *"Oi, gostaria de ver se o Dr. Renato tem horário na quinta"* e ela entende.
* Suas mensagens são curtas, bem espaçadas e com emojis delicados (😊, 🩺, 📅).

### B) Foco Total em Cuidar da Agenda (Sem "papo furado"):
* A Sofia **não é ouvinte de desabafos cotidianos** nem terapeuta. Se alguém começar a falar de política, piadas ou desabafos da vida, ela responde educadamente e puxa o assunto de volta para a saúde e para o agendamento da consulta.
* Se alguém insistir em bater papo aleatório por muitas mensagens seguidas, ela encerra gentilmente o atendimento para deixar o canal livre para quem realmente precisa de atendimento médico.

### C) Limite Ético e Médico (Não é médica):
* A Sofia **nunca dá diagnóstico** e **nunca receita remédios** (*"posso tomar dipirona?"* -> *"Não posso indicar medicações por aqui, mas o doutor poderá avaliar você na consulta"*).
* Em casos de emergência grave, ela orienta a ligar imediatamente para o **SAMU (192)** ou ir a um pronto-socorro.

---

## 📖 3. Diário de Decisões e Evolução do Produto

Abaixo está o histórico de como o sistema foi lapidado e como ele funciona exatamente hoje:

---

### Decisão 01: O Conceito de "Desmarcar" vs. "Cancelar"
* **Data da Decisão:** 03 de novembro de 2026
* **O que foi decidido:**
  1. No vocabulário com o paciente, a palavra **"desmarcar"** é muito mais gentil e menos punitiva do que "cancelar".
  2. Sempre que um paciente pede para desmarcar, a Sofia pergunta primeiro com carinho se ele não prefere **remarcar para outra data**, evitando que a clínica perca a consulta.
  3. **Se o paciente já tinha confirmado a presença:** A Sofia agradece muito pelo aviso prévio, explicando que ao avisar com antecedência ele ajudou a liberar a vaga para um paciente que estava na fila de espera.
  4. **No painel da recepção:** O botão agora diferencia visualmente quando a consulta já estava confirmada (**"Desmarcar (Já Confirmado)"**), exibindo um aviso preventivo para evitar que a recepção apague um paciente certo por engano.

---

### Decisão 02: A Sofia Respeita a Especialidade do Médico
* **Data da Decisão:** 01 de novembro de 2026
* **O que foi decidido:**
  * O sistema atende qualquer especialidade (Pediatria, Cardiologia, Dermatologia, etc.).
  * Não precisamos programar mil regras manuais. A Sofia sabe qual é a especialidade do médico.
  * Se um paciente relatar uma queixa fora do escopo (exemplo: um adulto com dor no pescoço chamando o consultório de uma Pediatra), a Sofia acolhe a dor e pergunta com delicadeza: *"Como a Dra. Silvia é Pediatra e atende crianças e jovens, essa consulta seria para o seu filho(a) ou para você mesmo?"*.

---

### Decisão 03: Quem fala no WhatsApp nem sempre é quem vai consultar
* **Data da Decisão:** 02 de novembro de 2026
* **O que foi decidido:**
  * É muito comum uma mãe (ex: Elizabeth) mandar mensagem para marcar a consulta do filho pequeno (ex: Pedro Henrique).
  * A Sofia foi ensinada a **nunca confundir os nomes**: ela continua tratando a mãe pelo nome dela (*"Olá, Elizabeth!"*), enquanto registra a ficha médica e a consulta no nome do paciente real (*Pedro Henrique*).

---

### Decisão 04: Cadastro Obrigatório em 3 Passos
* **Data da Decisão:** 31 de outubro de 2026
* **O que foi decidido:**
  * Nenhuma consulta entra na agenda sem 3 dados essenciais: **Nome Completo**, **Data de Nascimento** e **CEP**.
  * A Sofia pede esses 3 dados de forma acolhedora antes de bater o martelo da consulta, garantindo prontuário organizado para o médico.

---

### Decisão 05: Fila de Espera Inteligente (Não perder dinheiro com desistências)
* **Data da Decisão:** 30 de outubro de 2026
* **O que foi decidido:**
  * Quando um horário é desmarcado, a Sofia não espera alguém procurar a clínica.
  * O sistema busca automaticamente o primeiro paciente cadastrado na **Fila de Espera** e envia uma mensagem oferecendo a vaga que acabou de abrir.

---

### Decisão 06: Botão de Intervenção Humana (A secretária sempre no controle)
* **Data da Decisão:** 28 de outubro de 2026
* **O que foi decidido:**
  * Se a secretária física ou o médico quiserem conversar diretamente com o paciente sem a Sofia interferir, existe o botão de **Intervenção Humana** no painel.
  * Ao clicar nele, a Sofia fica em silêncio imediato para aquele paciente. Para religar, basta um clique ou o paciente digitar `/bot`.

---

## 📊 4. Como o Médico ou a Secretária Usam o Sistema Hoje?

Para quem opera o consultório, a rotina é muito simples:

1. **Pela manhã:** O médico abre o Iterum no celular ou computador e vê a lista de pacientes do dia com os status:
   * 🟢 **Confirmado (Verde):** Paciente já confirmou que vai (a Sofia enviou o lembrete 24h antes e ele respondeu).
   * 🔵 **Agendado (Azul):** Consulta marcada na grade, vaga garantida.
   * 🟣 **Encaixe (Roxo):** Paciente que veio da fila de espera após uma desistência.
2. **Durante o dia:** A Sofia atende as mensagens no WhatsApp sem que a recepção precise digitar. Se alguém pedir para desmarcar ou remarcar, a Sofia atualiza a grade sozinha.
3. **No fim do expediente:** O médico tem a certeza de que nenhum paciente ficou sem resposta no WhatsApp, mesmo quem mandou mensagem às 22h ou no domingo.

---

## 📋 5. Resumo das Próximas Evoluções Planejadas

O que está desenhado para as próximas versões do produto:
1. **Integração com Google Agenda:** O que for marcado no Iterum aparecer no Google Agenda pessoal do médico.
2. **Cobrança de Sinal por Pix:** Opção para cobrar o valor da consulta ou um sinal antecipado para reduzir ainda mais as faltas.
3. **Atendimento de Voz (Telefone):** A Sofia atender chamadas telefônicas com voz humanizada.

---

*Este documento continuará sendo atualizado a cada nova funcionalidade aprovada pela equipe.*
