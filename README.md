# App de Treino

App web (PWA) para montar a ficha de treino e controlar carga e repetições na academia.
Instala no iPhone pelo Safari → Compartilhar → **Adicionar à Tela de Início**, e funciona offline.

## Rodar no PC

```bash
npm install
npm run dev
```

Build de produção: `npm run build` (sai em `dist/`). Os ícones são gerados com `npm run icons`.

## Como está organizado

- `src/db.ts`: tipos e banco local (IndexedDB via Dexie). Marca o que mudou (`dirty`) e o que foi apagado (`tombstones`) para mandar à nuvem.
- `src/config.ts`: URL e chave pública do Supabase (não são segredo; a proteção é o RLS).
- `src/lib/sync.ts` e `src/lib/syncEngine.ts`: login (e-mail e senha) e sincronização. Teste: `npm run test:sync`.
- `src/data/library.ts`: lista pronta de exercícios, grupos musculares e tipos de carga.
- `src/lib/stats.ts`: regra de "anterior" e "melhor série".
- `src/lib/analytics.ts`: cálculos da aba Evolução (carga, força estimada, volume, resumo do mês, séries por grupo).
- `src/screens/`: abas Ficha, Treinar, Evolução e Histórico.
- `supabase/schema.sql`: tabela e regras de acesso da nuvem (colar no SQL Editor do Supabase).

### Regras

- **Melhor série** = maior carga; empatou na carga, vale a que tiver mais repetições.
  Aquecimento e drops não contam para o recorde.
- **Força estimada** = quanto levantaria 1 vez (Epley: carga × (1 + reps/30)), pela melhor série do treino.
- **Volume** = soma de carga × reps das séries do treino, com drops e sem aquecimento.
- **Resumo do mês** em andamento compara com o mesmo pedaço do mês anterior (dia 1 até hoje).
- **Anterior** = a mesma série (1ª, 2ª…) do último treino em que o exercício apareceu.
- O histórico é por exercício, não por dia ou ficha: trocar de ficha não perde nada.
- Trocar ou tirar um exercício durante o treino vale só para aquele treino; a ficha não muda.
- **Drop set**: dá para planejar na ficha (na última série ou em todas, 1 a 3 drops); essas séries já abrem
  com os drops no treino. O botão "Drop" na série continua para adicionar na hora.
- **Rest-pause**: só uma etiqueta no exercício da ficha (aparece no treino). O registro de carga e reps não muda.

### Visual

- Tema "Garagem": preto quente, âmbar (`--accent: #ffb000`) e títulos em Oswald, em caixa alta. Cores em `:root` no `src/styles.css`.
- Ícones gerados por `npm run icons` (mesmas cores). No iPhone, o ícone da Tela de Início só muda se o app for adicionado de novo.

### Academia no segundo cérebro

- `npm run cerebro` baixa os dados da nuvem e escreve 3 notas em `D:\SecondBrain\01-Eu\Academia\`:
  `Academia.md` (só o bloco entre os marcadores `app-treino`), `Ficha-Atual.md` e `Evolucao.md`.
- Na primeira vez: `npm run cerebro:login` (pede e-mail e senha no terminal). A senha não fica salva; só a sessão,
  em `~/.app-treino/cerebro-sessao.json` (fora do repositório).
- `npm run cerebro -- --backup arquivo.json` usa um backup do app; `--saida pasta` escreve em outra pasta (teste).
- O script não faz git: depois de rodar, sincronize o cérebro pela skill `/cerebro`.

### Login e nuvem

- O app continua funcionando sem internet: os dados ficam no celular e vão para a nuvem quando há sinal
  (ao abrir, ao voltar para o app, ao voltar a internet, logo após cada mudança e a cada 2 min).
- Na nuvem fica uma linha por registro em `records` (ver `supabase/schema.sql`). Excluir vira `deleted = true`.
- Conflito entre aparelhos: vale a alteração mais recente.
- Sair da conta apaga os dados do aparelho (continuam na nuvem). "Usar sem conta" mantém tudo só no aparelho.
- Publicação: Vercel, a partir da branch `main` do repositório privado no GitHub.

## Próximas versões

- [x] Aba Evolução: gráfico por exercício (carga, força, volume), resumo do mês, séries por grupo na semana
- [x] Login e nuvem com Supabase + publicação na Vercel (código privado no GitHub)
- [x] v3: visual novo (Garagem), etiqueta de rest-pause e resumo dos treinos no segundo cérebro

### Ideias para a v4 (ou depois)

- [ ] Enviar a ficha para outra pessoa por um código curto (ex.: os pais, com conta própria)
- [ ] Triset / circuito (3 ou mais exercícios no mesmo bloco)
- [ ] Compartilhar o resumo do treino ao terminar (texto para o WhatsApp)
- [ ] Talvez: marcar falha ou RIR na série

Descartados por enquanto: vídeos dos exercícios e cronômetro de descanso.
