---
trigger: always_on
description: Regra de versionamento automático no Git após alterações de código.
---

# Fluxo de Versionamento e Deploy no Git

Sempre que concluir modificações no código do projeto:
1. Validar a integridade (sem erros de compilação ou regressões).
2. Criar um commit descritivo no padrão **Conventional Commits em português** (ex.: `feat(...)`, `fix(...)`, `perf(...)`, `refactor(...)`).
3. Executar o `git push` para a branch `main` (`origin main`).
4. Conferir que arquivos sensíveis (`.env`, dados locais) nunca sejam commitados.
