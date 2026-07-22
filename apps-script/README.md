# Apps Script — EBA · Eco Bazar

Código do Google Apps Script que recebe pedidos e avaliações do site e grava na planilha do Google Sheets.

## Como usar

1. Abra a planilha oficial da EBA no Google Sheets.
2. Vá em **Extensões > Apps Script**.
3. Apague o conteúdo do arquivo `Code.gs` e cole o conteúdo de `Code.gs` deste repositório.
4. Salve (Ctrl+S).
5. Rode a função **`montarPlanilha`** uma vez (menu Executar > montarPlanilha) e autorize o acesso.
6. Faça o deploy: **Implantar > Nova implantação > Tipo: App da Web**.
   - Executar como: **eu**
   - Acesso: **qualquer pessoa**
7. Copie a URL gerada e cole na variável `SCRIPT_URL` do `index.html` do site.

## O que faz

| Função | Descrição |
|---|---|
| `doPost(e)` | Recebe pedidos e avaliações do site via POST. Pedidos vão para a aba "Pedidos", avaliações para "Avaliações". Dispara e-mail HTML para a equipe a cada pedido e alerta se a avaliação for ≤ 2 estrelas. |
| `montarPlanilha()` | Organiza a planilha com abas: Resumo, Pedidos do Site, Brechó, Bijus, Acessórios, Avaliações. Roda uma vez. |
| `testarGravacao()` | Simula um pedido de teste. |
| `testarAvaliacao()` | Simula uma avaliação positiva (5 estrelas). |
| `testarAvaliacaoBaixa()` | Simula uma avaliação baixa (2 estrelas) — dispara e-mail de alerta. |

## Abas criadas

- **Resumo** — totais de vendas por canal + estatísticas de avaliações (média, contagem, notas baixas/altas)
- **Pedidos do Site** — preenchida automaticamente pelo site
- **Brechó / Bijus / Acessórios** — preenchidas manualmente pelos vendedores
- **Avaliações** — estrelinhas dos clientes (automática)
