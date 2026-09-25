/**
 * EBA · Eco Bazar — Apps Script unificado
 * ========================================
 * doPost()          → recebe pedidos e avaliações do site
 * montarPlanilha()  → organiza a planilha (rodar 1× após colar o código)
 *
 * Deploy: Extensões > Apps Script > Implantar > Gerenciar implantações >
 *         Editar (lápis) > Versão: Nova versão. Assim a URL continua a mesma.
 *         Executar como: eu | Acesso: qualquer pessoa
 *
 * Segurança (ver SEGURANCA.md na raiz do repositório):
 *  - Este script NÃO tem doGet. A URL pública só aceita gravar, nunca ler.
 *    Não crie um doGet que devolva dados da planilha.
 *  - Os e-mails da equipe NÃO ficam no código (o repositório é público).
 *    Configure em: Configurações do projeto (engrenagem) > Propriedades do
 *    script > EMAIL_AVISO = um e-mail (ou vários separados por vírgula).
 *  - Tudo que vem do site é tratado como não confiável: limitado, validado,
 *    neutralizado contra fórmulas na planilha e escapado no HTML do e-mail.
 */

const ABA = "Pedidos do Site";
const TZ  = "America/Sao_Paulo";

// [campo enviado pelo site, nome na planilha, preço em R$]
// Precisa bater com a lista P do index.html. O total é recalculado aqui,
// o valor que vem do navegador é ignorado.
const PRODUTOS = [
  ["q_chaveiro_simples", "Chaveiro Simples",       5],
  ["q_chaveiro_normal",  "Chaveiro Normal",        8],
  ["q_phone_strap",      "Phone Strap",           10],
  ["q_chaveiro_perso",   "Chaveiro Personalizado",10],
  ["q_botton",           "Botton",                 4],
  ["q_botton_grande",    "Botton Grande",          6],
  ["q_ecobag",           "Ecobag",                15],
  ["q_mochilinha",       "Mochilinha",            15],
  ["q_caneca",           "Caneca",                20],
  ["q_xicara",           "Xícara",                30],
  ["q_colar",            "Colar Miçanga",         15],
  ["q_pulseira",         "Pulseira Miçanga",      12]
];

const QTD_MAX = 50;                  // por produto, por pedido (o site usa o mesmo limite)
const LIMITE_PEDIDOS_10MIN = 30;     // acima disso o site recebe erro e manda pelo WhatsApp
const LIMITE_AVALIACOES_10MIN = 30;
const LIMITE_EMAILS_PEDIDO_HORA = 20; // acima disso grava, mas não manda e-mail (poupa a cota)
const LIMITE_ALERTAS_HORA = 3;        // alertas de avaliação baixa têm cota separada

/* ================================================================
   Helpers de segurança
   ================================================================ */

// Converte em texto, tira caracteres de controle e corta no tamanho máximo.
function limpar(v, max) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").trim().slice(0, max);
}

// Impede que texto do cliente vire fórmula na planilha (=IMAGE, =IMPORTXML...).
function celulaSegura(v) {
  if (typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

// Escape HTML para tudo que entra no corpo do e-mail.
function esc(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function emailsAviso() {
  return PropertiesService.getScriptProperties().getProperty("EMAIL_AVISO") || "";
}

// Contador por janela fixa de tempo (global: o Apps Script não expõe o IP).
// A chave muda a cada janela, então o contador zera sozinho mesmo com
// tráfego contínuo.
function contar(chave, janelaSeg) {
  const cache = CacheService.getScriptCache();
  const k = chave + ":" + Math.floor(Date.now() / (janelaSeg * 1000));
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), janelaSeg);
  return n;
}

function proximoNumeroPedido() {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty("ULTIMO_PEDIDO") || 0) + 1;
  props.setProperty("ULTIMO_PEDIDO", String(n));
  return "EBA-" + ("000" + n).slice(-4);
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================================================================
   doPost — ponto de entrada para pedidos e avaliações
   ================================================================ */
function doPost(e) {
  let email = null; // enviado depois de liberar o lock, para não segurar a fila
  let saida;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    saida = processar(e, function(msg) { email = msg; });
  } catch (err) {
    console.error(err);
    saida = {ok: false};
  } finally {
    lock.releaseLock();
  }
  if (email) {
    try {
      MailApp.sendEmail(email);
    } catch (mailErr) {
      console.warn("Falha ao enviar e-mail: " + mailErr);
    }
  }
  return resposta(saida);
}

function processar(e, agendarEmail) {
  if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 20000) {
    return {ok: false};
  }
  const d = JSON.parse(e.postData.contents);
  if (!d || typeof d !== "object") return {ok: false};

  // Honeypot: campo invisível no site. Gente de verdade deixa vazio.
  if (d.hp_eba) return {ok: false};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dest = emailsAviso();

  // ---- AVALIAÇÃO (estrelinhas pós-pedido) ----
  if (d.tipo === 'avaliacao') {
    const estrelas = Number(d.estrelas);
    if (!Number.isInteger(estrelas) || estrelas < 1 || estrelas > 5) return {ok: false};
    if (contar("avaliacoes", 600) > LIMITE_AVALIACOES_10MIN) return {ok: false};

    const av = {
      pedido:     limpar(d.pedido, 20),
      estrelas:   estrelas,
      comentario: limpar(d.comentario, 300),
      nome:       limpar(d.nome, 80)
    };
    const abaAv = ss.getSheetByName('Avaliações') || criarAbaAvaliacoes(ss);
    abaAv.appendRow([new Date(), av.pedido, av.estrelas, av.comentario, av.nome].map(celulaSegura));

    // Alerta por e-mail se nota <= 2 (cota própria, não consome a dos pedidos)
    if (dest && estrelas <= 2 && contar("alertas", 3600) <= LIMITE_ALERTAS_HORA) {
      agendarEmail({
        to: dest,
        subject: 'Avaliação baixa: ' + (av.nome || 'cliente') + ' deu ' + estrelas + ' estrela(s)',
        htmlBody: montarHtmlAlerta(av)
      });
    }
    return {ok: true};
  }

  // ---- PEDIDO (fluxo normal) ----
  const p = {
    nome:           limpar(d.nome, 80),
    whatsapp:       limpar(d.whatsapp, 20),
    perfil:         "Cliente externo",
    personalizacao: limpar(d.personalizacao, 1000)
  };
  const digitos = p.whatsapp.replace(/\D/g, "");
  if (p.nome.length < 2 || digitos.length < 10 || digitos.length > 11) return {ok: false};

  const qtds = PRODUTOS.map(function(prod) {
    const q = Math.floor(Number(d[prod[0]]) || 0);
    return Math.min(Math.max(q, 0), QTD_MAX);
  });
  const total = PRODUTOS.reduce(function(soma, prod, i) { return soma + qtds[i] * prod[2]; }, 0);
  if (total <= 0) return {ok: false};

  // Lista de itens montada aqui, a partir das quantidades validadas. A única
  // parte que vem do cliente é a personalização de cada item (p_<produto>).
  const itensArr = [];
  PRODUTOS.forEach(function(prod, i) {
    if (!qtds[i]) return;
    let linha = qtds[i] + "x " + prod[1] + " (R$" + (qtds[i] * prod[2]) + ")";
    const perso = limpar(d["p_" + prod[0].slice(2)], 120);
    if (perso) linha += " [" + perso + "]";
    itensArr.push(linha);
  });
  p.itens = itensArr.join(" | ");

  if (contar("pedidos", 600) > LIMITE_PEDIDOS_10MIN) return {ok: false};

  let aba = ss.getSheetByName(ABA);
  if (!aba) {
    aba = ss.insertSheet(ABA);
    const cab = ["Nº Pedido","Data/Hora","Nome","WhatsApp","Quem pediu","Itens do pedido","Total (R$)","Observações / Arte"]
      .concat(PRODUTOS.map(function(prod) { return prod[1]; }))
      .concat(["Status"]);
    aba.appendRow(cab);
    aba.getRange(1, 1, 1, cab.length).setFontWeight("bold").setBackground("#5E2A86").setFontColor("#ffffff");
    aba.setFrozenRows(1);
    aba.setColumnWidth(1, 90);
    aba.setColumnWidth(6, 280);
    aba.setColumnWidth(8, 220);
  }

  const pedido = proximoNumeroPedido();

  const linha = [
    pedido,
    new Date(),
    p.nome,
    p.whatsapp,
    p.perfil,
    p.itens,
    total,
    p.personalizacao
  ].concat(qtds)
   .concat(["Novo"])
   .map(celulaSegura);

  aba.appendRow(linha);

  if (dest && contar("emails", 3600) <= LIMITE_EMAILS_PEDIDO_HORA) {
    agendarEmail({
      to: dest,
      subject: 'Pedido ' + pedido + ': ' + p.nome + ' (R$' + total + ')',
      body: montarTextoPedido(pedido, p, total, itensArr),
      htmlBody: montarHtmlPedido(pedido, p, total, itensArr)
    });
  }

  return {ok: true, pedido: pedido, total: total};
}

/* ================================================================
   E-MAIL HTML — pedido
   ================================================================ */
function montarHtmlPedido(pedido, d, total, itensArr) {
  const linhasItens = itensArr.map(function(item, i) {
    var bg = i % 2 === 0 ? '#FFF8EE' : '#ffffff';
    return '<tr><td style="padding:8px 12px;border-bottom:1px solid #F0E2CE;background:' + bg + ';font-size:14px;">' + esc(item) + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0e8;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:24px 0;">'
    + '<tr><td align="center">'
    + '<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(94,42,134,.1);">'

    // Header roxo
    + '<tr><td style="background:#5E2A86;padding:24px 32px;text-align:center;">'
    + '<div style="font-size:28px;margin-bottom:4px;">🌱</div>'
    + '<div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">EBA &middot; Eco Bazar</div>'
    + '<div style="color:#d4b8f0;font-size:12px;margin-top:4px;">Moda e acess&oacute;rios sustent&aacute;veis</div>'
    + '</td></tr>'

    // Faixa amarela com nº do pedido
    + '<tr><td style="background:#F5B81E;padding:14px 32px;text-align:center;">'
    + '<span style="color:#5E2A86;font-size:16px;font-weight:bold;">Pedido ' + esc(pedido) + '</span>'
    + '</td></tr>'

    // Dados do cliente
    + '<tr><td style="padding:24px 32px 8px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + '<tr><td style="padding:6px 0;font-size:14px;color:#8b7c97;width:110px;">Nome</td>'
    + '<td style="padding:6px 0;font-size:14px;color:#33244a;font-weight:bold;">' + esc(d.nome || '-') + '</td></tr>'
    + '<tr><td style="padding:6px 0;font-size:14px;color:#8b7c97;">WhatsApp</td>'
    + '<td style="padding:6px 0;font-size:14px;color:#33244a;font-weight:bold;">' + esc(d.whatsapp || '-') + '</td></tr>'
    + '<tr><td style="padding:6px 0;font-size:14px;color:#8b7c97;">Quem pediu</td>'
    + '<td style="padding:6px 0;font-size:14px;color:#33244a;">' + esc(d.perfil || '-') + '</td></tr>'
    + '</table>'
    + '</td></tr>'

    // Itens
    + '<tr><td style="padding:16px 32px 4px;">'
    + '<div style="font-size:13px;color:#8b7c97;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Itens do pedido</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #F0E2CE;">'
    + linhasItens
    + '</table>'
    + '</td></tr>'

    // Total
    + '<tr><td style="padding:16px 32px 8px;text-align:right;">'
    + '<span style="font-size:13px;color:#8b7c97;">Total: </span>'
    + '<span style="font-size:22px;font-weight:bold;color:#5E2A86;">R$ ' + esc(total) + '</span>'
    + '</td></tr>'

    // Observações (se houver)
    + (d.personalizacao
      ? '<tr><td style="padding:8px 32px 16px;">'
        + '<div style="background:#FFF8EE;border-left:4px solid #F0822E;padding:12px 16px;border-radius:0 8px 8px 0;font-size:13px;color:#33244a;">'
        + '<strong style="color:#F0822E;">Observa&ccedil;&otilde;es:</strong> ' + esc(d.personalizacao)
        + '</div></td></tr>'
      : '')

    // Footer
    + '<tr><td style="padding:20px 32px 28px;text-align:center;border-top:1px solid #F0E2CE;">'
    + '<div style="font-size:13px;color:#8b7c97;">Responda pelo WhatsApp do cliente para confirmar modelos e pagamento.</div>'
    + '<div style="margin-top:12px;">'
    + '<a href="https://wa.me/55' + (d.whatsapp || '').replace(/\D/g, '') + '" '
    + 'style="display:inline-block;background:#3BA546;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">'
    + '💬 Abrir WhatsApp</a>'
    + '</div>'
    + '</td></tr>'

    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

function montarTextoPedido(pedido, d, total, itensArr) {
  return 'Novo pedido recebido pelo site:\n\n'
    + 'Nº do pedido: ' + pedido + '\n'
    + 'Nome: ' + (d.nome || '-') + '\n'
    + 'WhatsApp: ' + (d.whatsapp || '-') + '\n'
    + 'Quem pediu: ' + (d.perfil || '-') + '\n\n'
    + 'Itens:\n' + itensArr.join('\n') + '\n\n'
    + 'Total: R$ ' + total + '\n'
    + 'Observações: ' + (d.personalizacao || '-');
}

/* ================================================================
   E-MAIL HTML — alerta de avaliação baixa
   ================================================================ */
function montarHtmlAlerta(d) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f0e8;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:24px 0;">'
    + '<tr><td align="center">'
    + '<table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(94,42,134,.1);">'

    + '<tr><td style="background:#EE3B45;padding:20px 32px;text-align:center;">'
    + '<div style="color:#ffffff;font-size:18px;font-weight:bold;">⚠️ Avalia&ccedil;&atilde;o baixa recebida</div>'
    + '</td></tr>'

    + '<tr><td style="padding:24px 32px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0">'
    + '<tr><td style="padding:6px 0;font-size:14px;color:#8b7c97;width:100px;">Cliente</td>'
    + '<td style="padding:6px 0;font-size:14px;color:#33244a;font-weight:bold;">' + esc(d.nome || '-') + '</td></tr>'
    + '<tr><td style="padding:6px 0;font-size:14px;color:#8b7c97;">Pedido</td>'
    + '<td style="padding:6px 0;font-size:14px;color:#33244a;">' + esc(d.pedido || '-') + '</td></tr>'
    + '<tr><td style="padding:6px 0;font-size:14px;color:#8b7c97;">Nota</td>'
    + '<td style="padding:6px 0;font-size:22px;">⭐ ' + esc(d.estrelas || '?') + '/5</td></tr>'
    + (d.comentario
      ? '<tr><td style="padding:6px 0;font-size:14px;color:#8b7c97;vertical-align:top;">Coment&aacute;rio</td>'
        + '<td style="padding:6px 0;font-size:14px;color:#33244a;font-style:italic;">&quot;' + esc(d.comentario) + '&quot;</td></tr>'
      : '')
    + '</table>'
    + '</td></tr>'

    + '<tr><td style="padding:12px 32px 24px;text-align:center;border-top:1px solid #F0E2CE;">'
    + '<div style="font-size:13px;color:#8b7c97;">Considere entrar em contato com o cliente para entender o feedback.</div>'
    + '</td></tr>'

    + '</table></td></tr></table>'
    + '</body></html>';
}

/* ================================================================
   CRIAR ABA AVALIAÇÕES (usada por doPost e montarPlanilha)
   ================================================================ */
function criarAbaAvaliacoes(ss) {
  const cols = ["Data/Hora", "Nº Pedido", "Estrelas", "Comentário", "Nome do cliente"];
  const aba = ss.insertSheet('Avaliações');
  aba.getRange(1, 1, 1, cols.length).setValues([cols])
     .setFontWeight("bold").setBackground("#5E2A86").setFontColor("#ffffff")
     .setVerticalAlignment("middle").setWrap(true);
  aba.setFrozenRows(1);

  aba.setColumnWidth(1, 140);
  aba.setColumnWidth(2, 100);
  aba.setColumnWidth(3,  80);
  aba.setColumnWidth(4, 280);
  aba.setColumnWidth(5, 160);

  aba.getRange(2, 1, 500, 1).setNumberFormat('dd/mm/yyyy HH:mm');

  // Validação: estrelas 1–5
  const regra = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(1, 5)
    .setAllowInvalid(false)
    .build();
  aba.getRange(2, 3, 500, 1).setDataValidation(regra);

  return aba;
}

/* ================================================================
   TESTE LOCAL — simula um pedido e uma avaliação
   ================================================================ */
function testarGravacao() {
  doPost({postData:{contents:JSON.stringify({
    nome: "Teste da Silva",
    whatsapp: "(51) 99999-9999",
    p_colar: "rosa, nome Ana",
    personalizacao: "Caneca com arte do curso",
    q_caneca: 2,
    q_colar: 1
  })}});
}

function testarAvaliacao() {
  doPost({postData:{contents:JSON.stringify({
    tipo: 'avaliacao',
    pedido: '0707-1500',
    estrelas: 5,
    comentario: 'Site muito bonito, adorei os produtos!',
    nome: 'Maria Teste'
  })}});
}

function testarAvaliacaoBaixa() {
  doPost({postData:{contents:JSON.stringify({
    tipo: 'avaliacao',
    pedido: '0707-1501',
    estrelas: 2,
    comentario: 'Demora na entrega',
    nome: 'João Teste'
  })}});
}

/* ================================================================
   MONTAR PLANILHA — roda 1× para organizar tudo
   ================================================================ */
const LINHAS_MANUAIS = 50;

function montarPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Pedidos do Site (automática)
  const colsSite = [
    "Nº Pedido","Data/Hora","Nome","WhatsApp","Quem pediu","Itens do pedido",
    "Total (R$)","Observações / Arte",
    "Chaveiro Simples","Chaveiro Normal","Phone Strap","Chaveiro Personalizado",
    "Botton","Botton Grande","Ecobag","Mochilinha","Caneca","Xícara",
    "Colar Miçanga","Pulseira Miçanga","Status"
  ];
  garantirAbaCabecalho(ss, "Pedidos do Site", colsSite, "#5E2A86");

  // 2–4. Abas manuais
  const colsManual = [
    "Nº Venda","Data","Produto","Categoria","Qtd",
    "Preço Unit. (R$)","Total (R$)","Pagamento","Vendedor","Obs."
  ];
  criarAbaManual(ss, "Brechó",     colsManual, "#3BA546");
  criarAbaManual(ss, "Bijus",      colsManual, "#D6248A");
  criarAbaManual(ss, "Acessórios", colsManual, "#F0822E");

  // 5. Avaliações
  if (!ss.getSheetByName('Avaliações')) {
    criarAbaAvaliacoes(ss);
  }

  // 6. Resumo
  montarResumo(ss);

  // Ordenar abas
  ordenar(ss, ["Resumo", "Pedidos do Site", "Brechó", "Bijus", "Acessórios", "Avaliações"]);

  SpreadsheetApp.getUi().alert(
    "✅ Planilha EBA organizada!\n\n"
    + "Abas: Resumo · Pedidos do Site · Brechó · Bijus · Acessórios · Avaliações"
  );
}

/* ---------- helpers ---------- */

function garantirAbaCabecalho(ss, nome, cols, cor) {
  var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
  aba.getRange(1, 1, 1, cols.length).setValues([cols])
     .setFontWeight("bold").setBackground(cor).setFontColor("#ffffff")
     .setVerticalAlignment("middle");
  aba.setFrozenRows(1);
  aba.getRange(1, 1, 1, cols.length).setWrap(true);
  return aba;
}

function criarAbaManual(ss, nome, cols, cor) {
  const aba = garantirAbaCabecalho(ss, nome, cols, cor);

  for (let i = 0; i < LINHAS_MANUAIS; i++) {
    const linha = i + 2;
    const cel = aba.getRange(linha, 1);
    if (!cel.getValue()) cel.setValue(("00" + (i + 1)).slice(-3));
    const totalCel = aba.getRange(linha, 7);
    if (!totalCel.getFormula()) {
      totalCel.setFormula('=IF(E' + linha + '*F' + linha + '=0;"";E' + linha + '*F' + linha + ')');
    }
  }

  const regrasPg = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Pix", "Dinheiro", "Cartão", "Outro"], true).build();
  aba.getRange(2, 8, LINHAS_MANUAIS, 1).setDataValidation(regrasPg);

  aba.getRange(2, 6, LINHAS_MANUAIS, 2).setNumberFormat('R$ #,##0.00');
  aba.getRange(2, 2, LINHAS_MANUAIS, 1).setNumberFormat('dd/mm/yyyy');
  aba.setColumnWidth(3, 200);
  larguraPadrao(aba, cols.length);

  const linhaTotal = LINHAS_MANUAIS + 2;
  aba.getRange(linhaTotal, 6).setValue("TOTAL").setFontWeight("bold");
  aba.getRange(linhaTotal, 7)
     .setFormula(somaCanal(null, LINHAS_MANUAIS + 1))
     .setFontWeight("bold").setNumberFormat('R$ #,##0.00').setBackground("#fff3d6");
}

function montarResumo(ss) {
  const aba = ss.getSheetByName("Resumo") || ss.insertSheet("Resumo");
  aba.clear();

  aba.getRange("A1").setValue("EBA · Eco Bazar — Controle de Caixa")
     .setFontSize(16).setFontWeight("bold").setFontColor("#5E2A86");

  // Vendas por canal
  const linhas = [
    ["Canal", "Total Arrecadado (R$)"],
    ["Pedidos do Site", "=SUM(INDIRECT(\"'Pedidos do Site'!G2:G\"))"],
    ["Brechó",          somaCanal("Brechó",     LINHAS_MANUAIS + 1)],
    ["Bijus",           somaCanal("Bijus",      LINHAS_MANUAIS + 1)],
    ["Acessórios",      somaCanal("Acessórios", LINHAS_MANUAIS + 1)]
  ];
  aba.getRange(3, 1, linhas.length, 2).setValues(linhas);
  aba.getRange(3, 1, 1, 2).setFontWeight("bold").setBackground("#5E2A86").setFontColor("#fff");
  aba.getRange(8, 1).setValue("TOTAL GERAL").setFontWeight("bold");
  aba.getRange(8, 2).setFormula("=SUM(B4:B7)").setFontWeight("bold")
     .setBackground("#F5B81E").setNumberFormat('R$ #,##0.00');
  aba.getRange(4, 2, 5, 1).setNumberFormat('R$ #,##0.00');

  // Bloco de avaliações
  aba.getRange("A10").setValue("Avaliações dos clientes")
     .setFontSize(14).setFontWeight("bold").setFontColor("#5E2A86");
  aba.getRange("A11").setValue("Total de avaliações");
  aba.getRange("B11").setFormula("=COUNTA(INDIRECT(\"'Avaliações'!A2:A\"))");
  aba.getRange("A12").setValue("Média de estrelas");
  aba.getRange("B12").setFormula('=IFERROR(AVERAGE(INDIRECT("\'Avaliações\'!C2:C"));"-")');
  aba.getRange("A13").setValue("Avaliações ≤ 2★");
  aba.getRange("B13").setFormula('=COUNTIF(INDIRECT("\'Avaliações\'!C2:C");"<=2")');
  aba.getRange("A14").setValue("Avaliações ≥ 4★");
  aba.getRange("B14").setFormula('=COUNTIF(INDIRECT("\'Avaliações\'!C2:C");">=4")');

  aba.getRange("A11:A14").setFontColor("#8b7c97");
  aba.getRange("B12").setNumberFormat('0.0');

  aba.setColumnWidth(1, 200);
  aba.setColumnWidth(2, 180);
}

// Soma a coluna Total (G) de uma aba manual, ignorando linhas marcadas como
// "TOTAL" na coluna F (subtotais feitos à mão não entram duas vezes).
// Com nome de aba, usa INDIRECT para a fórmula não virar #REF! se a aba
// for apagada e criada de novo.
function somaCanal(nomeAba, ultimaLinha) {
  if (!nomeAba) return '=SUMIF(F2:F' + ultimaLinha + ';"<>TOTAL";G2:G' + ultimaLinha + ')';
  const ref = function(col) { return 'INDIRECT("\'' + nomeAba + '\'!' + col + '2:' + col + ultimaLinha + '")'; };
  return '=SUMIF(' + ref("F") + ';"<>TOTAL";' + ref("G") + ')';
}

function larguraPadrao(aba, n) {
  for (let c = 1; c <= n; c++) {
    if (aba.getColumnWidth(c) < 90) aba.setColumnWidth(c, 110);
  }
}

function ordenar(ss, ordem) {
  ordem.forEach(function(nome, i) {
    var a = ss.getSheetByName(nome);
    if (a) { ss.setActiveSheet(a); ss.moveActiveSheet(i + 1); }
  });
}
