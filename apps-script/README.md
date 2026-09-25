# Apps Script: EBA · Eco Bazar

Código do Google Apps Script que recebe pedidos e avaliações do site e grava na planilha do Google Sheets. O checklist completo de segurança está em [`../SEGURANCA.md`](../SEGURANCA.md).

## Como usar

1. Abra a planilha oficial da EBA no Google Sheets.
2. Vá em **Extensões > Apps Script**.
3. Apague o conteúdo do arquivo `Code.gs` e cole o conteúdo de `Code.gs` deste repositório.
4. Salve (Ctrl+S).
5. **Configurações do projeto (engrenagem) > Propriedades do script:** crie `EMAIL_AVISO` com os e-mails da equipe separados por vírgula (ou o endereço de um Google Grupo, que gasta menos cota). Os e-mails não ficam no código porque o repositório é público.
6. Rode a função **`montarPlanilha`** uma vez (menu Executar > montarPlanilha) e autorize o acesso.
7. Deploy:
   - **Primeira vez:** Implantar > Nova implantação > Tipo: App da Web. Executar como: **eu**. Acesso: **qualquer pessoa**. Copie a URL para `SCRIPT_URL` no `index.html`.
   - **Atualizando o código:** Implantar > **Gerenciar implantações** > lápis > Versão: **Nova versão**. A URL continua a mesma. Arquive as implantações antigas.

## O que faz

| Função | Descrição |
|---|---|
| `doPost(e)` | Recebe pedidos e avaliações do site via POST. Valida os campos, recalcula o total com os preços daqui, neutraliza fórmulas e grava em "Pedidos do Site" / "Avaliações". Manda e-mail para `EMAIL_AVISO` a cada pedido e alerta se a avaliação for ≤ 2 estrelas. |
| `montarPlanilha()` | Organiza a planilha com abas: Resumo, Pedidos do Site, Brechó, Bijus, Acessórios, Avaliações. Roda uma vez. |
| `testarGravacao()` | Simula um pedido de teste. |
| `testarAvaliacao()` | Simula uma avaliação positiva (5 estrelas). |
| `testarAvaliacaoBaixa()` | Simula uma avaliação baixa (2 estrelas) e dispara o e-mail de alerta. |

## Proteções

- **Sem `doGet`:** a URL pública só grava, não devolve dados. Não crie um `doGet`.
- **Fórmulas neutralizadas:** texto que começa com `= + - @` ganha um `'` na frente, para não virar fórmula na planilha.
- **HTML escapado** em tudo que o cliente digita e aparece nos e-mails.
- **Total e lista de itens montados no servidor** a partir das quantidades (máx. 50 por item) e dos preços de `PRODUTOS`. O site usa o total devolvido pelo script no Pix e no WhatsApp. **Se mudar um preço, mude aqui e no `index.html`.**
- O e-mail é enviado depois de liberar o lock, para pedidos simultâneos não ficarem esperando o Gmail.
- **Anti-spam:** campo invisível (`hp_eba`) que só robô preenche. Acima de 30 pedidos em 10 min, o script recusa e o site manda o cliente finalizar pelo WhatsApp. Acima de 20 e-mails de pedido por hora, o pedido é gravado mas o e-mail não é enviado. Alertas de avaliação baixa têm cota própria (3 por hora), para que avaliações falsas não consumam os avisos de pedido.
- **Nº do pedido sequencial** (`EBA-0001`, `EBA-0002`...), guardado na propriedade `ULTIMO_PEDIDO`.
- Erros não devolvem detalhes para o navegador; ficam no log de execuções do Apps Script.

## Abas criadas

- **Resumo:** totais de vendas por canal + estatísticas de avaliações (média, contagem, notas baixas/altas)
- **Pedidos do Site:** preenchida automaticamente pelo site
- **Brechó / Bijus / Acessórios:** preenchidas manualmente pelos vendedores
- **Avaliações:** estrelinhas dos clientes (automática)
