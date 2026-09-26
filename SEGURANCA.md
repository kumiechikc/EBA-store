# Segurança e lançamento: checklist

O código deste repositório já faz a parte dele: o Apps Script valida tudo o que chega, neutraliza fórmulas na planilha, escapa o HTML dos e-mails, recalcula o total, limita spam e não tem nenhuma rota de leitura (`doGet`).

O resto depende de configuração nas contas, e **só quem tem acesso a elas pode fazer**. Sem esses passos, a correção no código não protege a planilha.

## 1. Planilha (Google Sheets)
- [ ] **Compartilhar → Acesso geral: "Restrito".** Nunca "Qualquer pessoa com o link".
- [ ] Na lista de pessoas, deixar só quem realmente cuida dos pedidos. Quem só consulta fica como **Leitor**, não Editor.
- [ ] Não baixar a planilha como CSV/Excel em computador compartilhado (laboratório, biblioteca).

## 2. Apps Script
- [ ] Colar o `apps-script/Code.gs` novo no editor e salvar.
- [ ] **Configurações do projeto (engrenagem) → Propriedades do script → Adicionar:**
  - `EMAIL_AVISO` = os e-mails que devem receber os pedidos, separados por vírgula (ex.: a mesma lista de 5 e-mails que ficava no código).
  - Atenção à cota: conta Gmail comum manda para no máximo **100 destinatários por dia**. Com 5 e-mails, cada pedido gasta 5, então por volta de **20 pedidos por dia** os avisos param de sair. O pedido continua gravado na planilha.
  - Para tirar esse teto: criar um **Google Grupo** gratuito com os 5 como membros e colocar só o endereço do grupo no `EMAIL_AVISO`. Aí cada pedido conta como 1 destinatário.
- [ ] **Implantar → Gerenciar implantações:**
  - Na implantação atual: lápis → Versão **"Nova versão"** → Implantar. A URL continua a mesma, então não precisa mexer no `index.html`.
  - **Arquivar todas as outras implantações.** URLs antigas continuam aceitando pedidos com o código antigo, sem as proteções.
- [ ] Rodar `montarPlanilha` de novo para criar a aba **"Métricas"** e o bloco "Tela de pedido (funil)" no Resumo. Sem isso as métricas do site não são gravadas (a aba é criada no primeiro envio, mas o Resumo fica sem o bloco).
- [ ] Rodar `testarGravacao` no editor e conferir que apareceu uma linha `EBA-0001` em **"Pedidos do Site"**. Depois apague a linha de teste.
- [ ] Se já existir uma aba chamada **"Pedidos"** com pedidos antigos: copie as linhas para "Pedidos do Site" e apague a aba "Pedidos". O código antigo gravava na aba errada, por isso o Resumo não somava os pedidos do site.
- [ ] **Nunca** adicionar uma função `doGet` que devolva dados da planilha. A URL do script é pública (está no site).

## 3. Contas
- [ ] **Verificação em 2 etapas** na conta Google dona da planilha e do script.
- [ ] Verificação em 2 etapas no **GitHub**.
- [ ] Verificação em 2 etapas no **Registro.br**.
- [ ] Verificação em 2 etapas na **Vercel**.

## 4. Domínio `ebastoreif.com.br` (Registro.br + Vercel)
O site é publicado pela **Vercel** (projeto `eba-store`), que faz deploy sozinha a cada merge na `main`. Os domínios `ebastoreif.com.br` e `www.ebastoreif.com.br` (este redireciona para o principal) **já foram adicionados ao projeto na Vercel**. Falta só o DNS:

1. **Vercel → projeto eba-store → Settings → Domains.** Confira os valores que a Vercel mostra para cada domínio. Se forem diferentes da tabela abaixo, **use os da Vercel**.
2. **Registro.br → Domínios → ebastoreif.com.br → DNS → Configurar zona DNS** (usar "DNS do Registro.br"). Adicionar:

   | Tipo  | Nome    | Valor |
   |-------|---------|-------|
   | A     | (vazio) | 76.76.21.21 |
   | CNAME | www     | cname.vercel-dns.com |

   Se houver outros registros `A`/`AAAA` no domínio vazio (por exemplo, os do GitHub Pages `185.199.x.x`), apague.
3. Esperar a propagação (minutos a algumas horas). Em Settings → Domains, os dois domínios ficam com "Valid Configuration" e o HTTPS é emitido automaticamente.
4. Testar:
   - `https://ebastoreif.com.br`
   - `https://www.ebastoreif.com.br` (deve redirecionar)
   - um pedido de verdade.
5. **GitHub → repositório → Settings → Pages:** se estiver ativado, **desativar**. Senão existem duas cópias do site no ar e uma delas fica sem manutenção.

Os cabeçalhos de segurança (bloqueio de iframe, HSTS, nosniff) ficam no `vercel.json`.

> Atenção: o plano gratuito (Hobby) da Vercel é para uso **não comercial**. Para projeto escolar costuma passar, mas uma loja vendendo produtos é zona cinzenta. Se a Vercel reclamar, a alternativa é o GitHub Pages, que também tem restrição para e-commerce.

## 5. Dados dos clientes (LGPD)
- O site coleta só nome e WhatsApp e avisa o cliente disso embaixo do formulário.
- Combinado no aviso: **apagar os dados quando o projeto terminar.** Coloquem uma data no calendário.
- Os e-mails de aviso também contêm os dados, então apaguem esses e-mails junto.

## Observação sobre o histórico do Git
Versões antigas do `Code.gs` tinham os e-mails pessoais da equipe e continuam no histórico público do repositório. Apagar o histórico não resolve (forks, caches e buscadores já podem ter copiado). O que dá para fazer é ficar atento a e-mails de phishing do tipo "novo pedido/pagamento EBA" que não vieram do script.
