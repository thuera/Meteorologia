/*
  ESTAÇÃO VÓRTICE — ETAPA 1
  Este arquivo lê o CSV e desenha os gráficos com SVG.
  Não altera o Arduino, não exige servidor e não prevê o tempo.
*/

// 1) Elementos da página que receberão as informações.
const entradaArquivo = document.getElementById("arquivoCSV");
const mensagemErro = document.getElementById("mensagemErro");

// 2) Converte um campo em número. "NA", "ERRO" e valores vazios viram null.
function converterNumero(valor) {
  if (valor === undefined || valor === null || valor.trim() === "") return null;
  const numero = Number(valor.trim().replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

// 3) Divide o CSV em linhas e colunas. O Arduino usa ponto e vírgula (;).
function interpretarCSV(texto) {
  const linhas = texto.replace(/^\uFEFF/, "").trim().split(/\r\n|\n|\r/);
  if (linhas.length < 2) throw new Error("O CSV está vazio ou só contém o cabeçalho.");

  const cabecalho = linhas[0].split(";").map(coluna => coluna.trim());
  const obrigatorias = ["leitura", "temp_dht_C", "umid_dht_pct", "pressao_hPa"];
  const ausentes = obrigatorias.filter(coluna => !cabecalho.includes(coluna));
  if (ausentes.length > 0) {
    throw new Error("Colunas necessárias não encontradas: " + ausentes.join(", "));
  }

  const registros = [];
  let linhasIgnoradas = 0;
  for (const linha of linhas.slice(1)) {
    if (!linha.trim()) continue;
    const valores = linha.split(";");
    if (valores.length !== cabecalho.length) {
      linhasIgnoradas++;
      continue;
    }
    const registro = {};
    cabecalho.forEach((nome, indice) => { registro[nome] = valores[indice].trim(); });
    if (converterNumero(registro.leitura) === null) {
      linhasIgnoradas++;
      continue;
    }
    registros.push(registro);
  }
  if (registros.length === 0) throw new Error("Nenhuma linha de medição válida foi encontrada.");
  return { registros, linhasIgnoradas };
}

// 4) Busca a última medição numérica válida de uma coluna.
function ultimoNumero(registros, coluna) {
  for (let i = registros.length - 1; i >= 0; i--) {
    const valor = converterNumero(registros[i][coluna]);
    if (valor !== null) return valor;
  }
  return null;
}

function formatar(valor, casas = 1) {
  if (valor === null) return "—";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// 5) Atualiza os quatro indicadores principais.
function atualizarIndicadores(registros) {
  const temperatura = ultimoNumero(registros, "temp_dht_C");
  const umidade = ultimoNumero(registros, "umid_dht_pct");
  const pressao = ultimoNumero(registros, "pressao_hPa");
  document.getElementById("valorTemperatura").textContent = temperatura === null ? "—" : formatar(temperatura) + " °C";
  document.getElementById("valorUmidade").textContent = umidade === null ? "—" : formatar(umidade) + " %";
  document.getElementById("valorPressao").textContent = pressao === null ? "—" : formatar(pressao, 2) + " hPa";

  // O estado do sensor de chuva já é calculado no Arduino.
  const estado = (registros[registros.length - 1].estado_chuva || "").toUpperCase();
  document.getElementById("valorChuva").textContent = ["MOLHADO", "SECO"].includes(estado) ? estado : "—";
}

// 6) Determina a escala horizontal correta para cada arquivo.
// Se o Arduino foi reiniciado e o relógio voltou a zero, usamos ordem das linhas.
function obterEixoHorizontal(registros) {
  const tempo = registros.map(linha => converterNumero(linha.tempo_s));
  const leituras = registros.map(linha => converterNumero(linha.leitura));
  const crescente = valores => valores.every((valor, i) =>
    valor !== null && (i === 0 || valor >= valores[i - 1]));

  if (crescente(tempo) && tempo[tempo.length - 1] > tempo[0]) {
    return { valores: tempo, descricao: "Eixo horizontal: segundos desde a inicialização" };
  }
  if (crescente(leituras) && leituras[leituras.length - 1] > leituras[0]) {
    return { valores: leituras, descricao: "Eixo horizontal: número da leitura" };
  }
  return {
    valores: registros.map((_, i) => i + 1),
    descricao: "Eixo horizontal: ordem das linhas (contador reiniciado)"
  };
}

// 7) Desenha um gráfico de linha, sem bibliotecas externas.
// O SVG é um desenho vetorial nativo do navegador.
function desenharGrafico(idSVG, registros, coluna, cor, eixo) {
  const svg = document.getElementById(idSVG);
  const valores = registros.map(linha => converterNumero(linha[coluna]));
  const validos = valores.filter(valor => valor !== null);

  if (validos.length === 0) {
    svg.innerHTML = '<text x="380" y="115" fill="#9bb1c0" text-anchor="middle" font-size="18">Sem dados válidos</text>';
    return;
  }

  const esquerda = 58, direita = 742, topo = 24, fundo = 185;
  // Evita espalhar milhares de números como argumentos de Math.min/Math.max.
  let minimo = Infinity, maximo = -Infinity;
  for (const valor of validos) {
    if (valor < minimo) minimo = valor;
    if (valor > maximo) maximo = valor;
  }
  const margem = (maximo - minimo || Math.max(Math.abs(maximo) * 0.1, 1)) * 0.15;
  minimo -= margem;
  maximo += margem;

  const inicioEixo = eixo.valores[0];
  const fimEixo = eixo.valores[eixo.valores.length - 1];
  const posicaoX = indice => esquerda +
    ((eixo.valores[indice] - inicioEixo) / Math.max(fimEixo - inicioEixo, 1)) * (direita - esquerda);
  const posicaoY = valor => fundo - (valor - minimo) / (maximo - minimo) * (fundo - topo);

  // Linhas de referência horizontais e números à esquerda.
  let desenho = "";
  for (let i = 0; i <= 4; i++) {
    const y = topo + i * (fundo - topo) / 4;
    const numero = maximo - i * (maximo - minimo) / 4;
    desenho += `<line x1="${esquerda}" y1="${y}" x2="${direita}" y2="${y}" stroke="#2b4051" stroke-width="1"/>`;
    desenho += `<text x="49" y="${y + 4}" text-anchor="end" fill="#9bb1c0" font-size="13">${numero.toFixed(1)}</text>`;
  }

  // Se uma leitura está ausente, a linha do gráfico é interrompida.
  let caminho = "";
  let linhaContinua = false;
  valores.forEach((valor, indice) => {
    if (valor === null) { linhaContinua = false; return; }
    caminho += `${linhaContinua ? "L" : "M"} ${posicaoX(indice).toFixed(1)} ${posicaoY(valor).toFixed(1)} `;
    linhaContinua = true;
  });
  desenho += `<path d="${caminho}" stroke="${cor}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  // Um arquivo com apenas uma leitura precisa mostrar um ponto, não uma linha vazia.
  if (valores.length === 1 && valores[0] !== null) {
    desenho += `<circle cx="${posicaoX(0)}" cy="${posicaoY(valores[0])}" r="5" fill="${cor}"/>`;
  }

  // Somente números passam para o SVG: não há interpretação de HTML do arquivo CSV.
  desenho += `<text x="${esquerda}" y="215" fill="#9bb1c0" font-size="13">${inicioEixo}</text>`;
  desenho += `<text x="${direita}" y="215" fill="#9bb1c0" text-anchor="end" font-size="13">${fimEixo}</text>`;
  svg.innerHTML = desenho;
}

// 8) Gera os quatro gráficos com as mesmas regras.
function atualizarGraficos(registros) {
  const eixo = obterEixoHorizontal(registros);
  document.getElementById("tipoEixo").textContent = eixo.descricao;

  desenharGrafico("graficoTemperatura", registros, "temp_dht_C", "#ffae73", eixo);
  desenharGrafico("graficoUmidade", registros, "umid_dht_pct", "#65dac8", eixo);
  desenharGrafico("graficoPressao", registros, "pressao_hPa", "#a5b4fc", eixo);
  const colunaLuz = Object.hasOwn(registros[0], "indice_luz_pct") ? "indice_luz_pct" : "luz_pct";
  desenharGrafico("graficoLuz", registros, colunaLuz, "#e6c675", eixo);
}

// 9) Mostra as últimas oito linhas para conferir se a importação está correta.
function atualizarTabela(registros) {
  const corpo = document.getElementById("corpoTabela");
  corpo.replaceChildren();
  registros.slice(-8).reverse().forEach(registro => {
    const linha = document.createElement("tr");
    const colunas = ["leitura", "tempo_s", "temp_dht_C", "umid_dht_pct", "pressao_hPa", "estado_chuva"];
    colunas.forEach(coluna => {
      const celula = document.createElement("td");
      celula.textContent = registro[coluna] || "—";
      linha.appendChild(celula);
    });
    corpo.appendChild(linha);
  });
}

// 10) Executa tudo quando o usuário escolhe um arquivo CSV.
async function carregarArquivo() {
  const arquivo = entradaArquivo.files[0];
  if (!arquivo) return;
  mensagemErro.hidden = true;

  try {
    if (!arquivo.name.toLowerCase().endsWith(".csv")) throw new Error("Selecione um arquivo com extensão .csv.");
    if (arquivo.size > 5 * 1024 * 1024) throw new Error("O arquivo excede 5 MB. Use um CSV menor para esta versão.");
    const texto = await arquivo.text();
    const resultado = interpretarCSV(texto);
    const registros = resultado.registros;

    atualizarIndicadores(registros);
    atualizarGraficos(registros);
    atualizarTabela(registros);
    document.getElementById("nomeArquivo").textContent = arquivo.name;
    document.getElementById("totalLeituras").textContent = `${registros.length} leituras carregadas`;
    document.getElementById("statusDados").textContent = "CSV carregado com sucesso";
    document.querySelector(".painel-status").classList.add("carregado");
    if (resultado.linhasIgnoradas > 0) {
      mensagemErro.textContent = `${resultado.linhasIgnoradas} linha(s) inconsistente(s) foram ignoradas.`;
      mensagemErro.hidden = false;
    }
  } catch (erro) {
    mensagemErro.textContent = erro.message + " Os dados carregados anteriormente, se houver, foram mantidos.";
    mensagemErro.hidden = false;
    document.getElementById("statusDados").textContent = "Falha na nova importação";
    document.querySelector(".painel-status").classList.remove("carregado");
    entradaArquivo.value = "";
  }
}

entradaArquivo.addEventListener("change", carregarArquivo);

// Desenha as áreas vazias antes do primeiro upload.
["graficoTemperatura", "graficoUmidade", "graficoPressao", "graficoLuz"].forEach(id => {
  document.getElementById(id).innerHTML = '<text x="380" y="115" fill="#9bb1c0" text-anchor="middle" font-size="18">Importe um CSV para ver o gráfico</text>';
});
