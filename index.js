const { chromium } = require('playwright');

const FIREBASE_URL = "https://history-dashboard-a70ee-default-rtdb.firebaseio.com/history";

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

    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();

    console.log("Acessando o URL de utilizador do Aviator...");
    await page.goto(AVIATOR_USER_URL, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {
        console.log("Aviso: Tempo limite de carregamento atingido, prosseguindo mesmo assim...");
    });

    console.log("Aguardando carregamento da interface do jogo (15 segundos)...");
    await page.waitForTimeout(15000);

    let ultimaVelaSalva = "";

    // Loop de verificação a cada 2 segundos
    setInterval(async () => {
        try {
            // Procura tanto no documento principal quanto dentro de eventuais iframes
            const frames = page.frames();
            let textoVela = null;

            for (const frame of frames) {
                try {
                    // Seletores para a bolha do histórico no topo do jogo
                    const el = await frame.$('.payouts-block .bubble-multiplier, .stats-line .bubble-multiplier, app-stats-widget .bubble-multiplier, .payout-item, [class*="bubble"]');
                    if (el) {
                        const txt = await el.innerText();
                        if (txt && txt.trim()) {
                            textoVela = txt.trim();
                            break;
                        }
                    }
                } catch (err) {}
            }

            if (textoVela) {
                // Remove 'x' se existir e extrai o número
                const limpo = textoVela.replace('x', '').replace(',', '.').trim();
                const valorNum = parseFloat(limpo);

                if (!isNaN(valorNum) && valorNum > 0) {
                    const valorAtualStr = valorNum.toFixed(2);
                    if (valorAtualStr !== ultimaVelaSalva) {
                        ultimaVelaSalva = valorAtualStr;
                        await salvarNoFirebase(valorAtualStr);
                    }
                }
            } else {
                console.log("[STATUS]: Aguardando renderização das velas na tela...");
            }
        } catch (e) {
            console.error("Erro no loop de verificação:", e.message);
        }
    }, 2000);
})();
