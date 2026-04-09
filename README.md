# Radar de Valor

Painel pessoal para analisar futebol com odds reais, contexto competitivo, score estatístico, revisão por IA e persistência no Turso.

## Stack

- `Next.js 16`
- `TypeScript`
- `Tailwind CSS 4`
- `OpenAI Responses API`
- `API-Football`
- `Turso / libSQL`

## O que já está pronto

- Interface visual completa sem login
- Filtros de data, janela, faixa de odd, ligas e famílias de mercado
- Coleta real de fixtures, odds, lineups, injuries, H2H, forma recente e predictions
- Score híbrido com odd implícita, odd justa, edge, EV, confiança e risco
- Revisão opcional por IA com `gpt-5.4`
- Salvamento da última carteira no banco
- Sugestão automática de múltipla

## Configuração

1. Copie `.env.example` para `.env.local`
2. Preencha:

```env
OPENAI_API_KEY=...
API_FOOTBALL_KEY=...
API_FOOTBALL_ODDS_MAX_PAGE=12
API_FOOTBALL_FREE_PLAN_MODE=false
API_FOOTBALL_ONLY_PRIMARY_BOOKMAKER=false
API_FOOTBALL_PRIMARY_BOOKMAKER_ID=34
API_FOOTBALL_PRIMARY_BOOKMAKER_NAME=Superbet
API_FOOTBALL_PRIMARY_BOOKMAKER_URL=https://superbet.bet.br/
API_FOOTBALL_MAX_FIXTURES_PER_SCAN=24
API_FOOTBALL_ODDS_CONCURRENCY=6
API_FOOTBALL_CONTEXT_CONCURRENCY=4
API_FOOTBALL_MAX_SEED_CANDIDATES=72
TURSO_DATABASE_URL=libsql://SEU-BANCO.turso.io
TURSO_AUTH_TOKEN=...
```

## Rodando

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Observações

- Se o `Turso` não estiver configurado, o app usa um banco local `libSQL` em arquivo para não travar o desenvolvimento.
- Se a chave da `OpenAI` não estiver configurada, o sistema continua com o motor heurístico e marca isso no fluxo.
- A análise atual está focada em `futebol`, com base estruturada para crescer em mercados e profundidade.
- O preset atual já está ajustado para plano `Pro`, com scan mais profundo, shortlist maior e contexto completo.
- O radar pode operar travado em uma casa específica, mas o preset atual já vem em `multi-casa` para não limitar a cobertura das odds.
- Se você voltar para o plano grátis, troque para `API_FOOTBALL_FREE_PLAN_MODE=true`, reduza `API_FOOTBALL_MAX_FIXTURES_PER_SCAN` e mantenha `API_FOOTBALL_ODDS_MAX_PAGE=3`.
