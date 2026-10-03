const { chromium } = require('playwright');

const FIREBASE_URL = "https://history-dashboard-a70ee-default-rtdb.firebaseio.com/history";

// Lê da variável de ambiente OU usa o URL direto que colocar abaixo
const AVIATOR_USER_URL = process.env.AVIATOR_USER_URL || "COLE_AQUI_O_SEU_URL_COMPLETO";

if (!AVIATOR_USER_URL || AVIATOR_USER_URL.includes("COLE_AQUI")) {
    console.error("ERRO CRÍTICO: O URL de utilizador não foi configurado!");
    process.exit(1);
}

function obterCor(valorNum) {
    if (valorNum >= 10) return "magenta-bg";
    if (valorNum >= 2) return "purple-bg";
    return "blue-bg";
}

async function salvarNoFirebase(valorStr) {
    const valorNum = parseFloat(valorStr);
    if (isNaN(valorNum) || valorNum <= 0) return;

    const multFormatado = valorNum.toFixed(2);
    const agora = new Date();
    
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');
    const micro = String(Math.floor(Math.random() * 900000) + 100000);

    const dataStr = `${ano}-${mes}-${dia}`;
    const horaStr = `${horas}:${minutos}:${segundos}`;
    const multChave = multFormatado.replace('.', '-');
    const chaveNo = `${ano}-${mes}-${dia}_${horas}-${minutos}-${segundos}-${micro}_${multChave}x`;

    const payload = {
        color: obterCor(valorNum),
        date: dataStr,
        multiplier: multFormatado,
        time: horaStr
    };

    try {
        await fetch(`${FIREBASE_URL}/${chaveNo}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log(`[RAILWAY - SALVO]: ${multFormatado}x às ${horaStr}`);
    } catch (err) {
        console.error("Erro ao enviar para o Firebase:", err);
    }
}

(async () => {
    console.log("Iniciando o robô de captura no Railway...");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Acessando o URL de utilizador do Aviator...");
    await page.goto(AVIATOR_USER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    let ultimaVelaSalva = "";

    // Loop de verificação a cada 2 segundos
    setInterval(async () => {
        try {
            // Procura os elementos do histórico na tela
            const elemento = await page.$('.payouts-block .bubble-multiplier, .stats-line .bubble-multiplier, [class*="bubble"]');
            if (elemento) {
                const texto = await elemento.innerText();
                const match = texto.trim().match(/^(\d+\.\d{2})x?$/);
                
                if (match) {
                    const valorAtual = match[1];
                    if (valorAtual !== ultimaVelaSalva) {
                        ultimaVelaSalva = valorAtual;
                        await salvarNoFirebase(valorAtual);
                    }
                }
            }
        } catch (e) {
            // Silencioso em falhas temporárias
        }
    }, 2000);
})();
