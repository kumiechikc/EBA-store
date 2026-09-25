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
  - `EMAIL_AVISO` = **um** e-mail (ex.: `tec.adm4ifrs@gmail.com`).
  - Motivo: conta Gmail comum tem cota de **100 destinatários por dia**. Cada pedido mandado para 5 pessoas gasta 5, então com 20 pedidos os avisos param. Com 1 destinatário, a cota dá para ~100 pedidos por dia.
- [ ] **Implantar → Gerenciar implantações:**
  - Na implantação atual: lápis → Versão **"Nova versão"** → Implantar. A URL continua a mesma, então não precisa mexer no `index.html`.
  - **Arquivar todas as outras implantações.** URLs antigas continuam aceitando pedidos com o código antigo, sem as proteções.
- [ ] Rodar `testarGravacao` no editor e conferir que apareceu uma linha `EBA-0001` em **"Pedidos do Site"**. Depois apague a linha de teste.
- [ ] Se já existir uma aba chamada **"Pedidos"** com pedidos antigos: copie as linhas para "Pedidos do Site" e apague a aba "Pedidos". O código antigo gravava na aba errada, por isso o Resumo não somava os pedidos do site.
- [ ] **Nunca** adicionar uma função `doGet` que devolva dados da planilha. A URL do script é pública (está no site).

## 3. Contas
- [ ] **Verificação em 2 etapas** na conta Google dona da planilha e do script.
- [ ] Verificação em 2 etapas no **GitHub**.
- [ ] Verificação em 2 etapas no **Registro.br**.

## 4. Domínio `ebastoreif.com.br` (Registro.br + GitHub Pages)
1. **Registro.br → Domínios → ebastoreif.com.br → DNS → Configurar zona DNS** (usar "DNS do Registro.br"). Adicionar:

   | Tipo  | Nome  | Valor |
   |-------|-------|-------|
   | A     | (vazio) | 185.199.108.153 |
   | A     | (vazio) | 185.199.109.153 |
   | A     | (vazio) | 185.199.110.153 |
   | A     | (vazio) | 185.199.111.153 |
   | AAAA  | (vazio) | 2606:50c0:8000::153 |
   | AAAA  | (vazio) | 2606:50c0:8001::153 |
   | AAAA  | (vazio) | 2606:50c0:8002::153 |
   | AAAA  | (vazio) | 2606:50c0:8003::153 |
   | CNAME | www   | kumiechikc.github.io |

2. Esperar a propagação. Costuma levar de minutos a algumas horas no Registro.br.
3. **GitHub → repositório → Settings → Pages → Custom domain:** `ebastoreif.com.br` → Save. Esperar o "DNS check successful".
4. Marcar **Enforce HTTPS**. O certificado pode levar até 24 h para ser emitido.
5. **GitHub → sua conta → Settings → Pages → Add a domain:** verificar `ebastoreif.com.br` com o registro TXT que o GitHub mostrar (criar no Registro.br). Isso impede que outra pessoa use o seu domínio no GitHub Pages se um dia o site for desligado.
6. Depois de tudo pronto, testar:
   - `https://ebastoreif.com.br`
   - `https://www.ebastoreif.com.br`
   - um pedido de verdade pelo site.

> Até o DNS funcionar, o endereço `kumiechikc.github.io/EBA-store` pode redirecionar para um domínio que ainda não abre. Se o site "sumir", é isso. Configure o DNS ou tire temporariamente o domínio em Settings → Pages.

## 5. Dados dos clientes (LGPD)
- O site coleta só nome e WhatsApp e avisa o cliente disso embaixo do formulário.
- Combinado no aviso: **apagar os dados quando o projeto terminar.** Coloquem uma data no calendário.
- Os e-mails de aviso também contêm os dados, então apaguem esses e-mails junto.

## Observação sobre o histórico do Git
Versões antigas do `Code.gs` tinham os e-mails pessoais da equipe e continuam no histórico público do repositório. Apagar o histórico não resolve (forks, caches e buscadores já podem ter copiado). O que dá para fazer é ficar atento a e-mails de phishing do tipo "novo pedido/pagamento EBA" que não vieram do script.
