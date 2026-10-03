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
    
    // Obter data e hora no fuso horário de Brasília (America/Sao_Paulo)
    const agora = new Date();
    const opcoesData = { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const opcoesHora = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

    const [dia, mes, ano] = agora.toLocaleDateString('pt-BR', opcoesData).split('/');
    const horaStr = agora.toLocaleTimeString('pt-BR', opcoesHora);

    const dataStr = `${ano}-${mes}-${dia}`;
    const micro = String(Math.floor(Math.random() * 900000) + 100000);

    const multChave = multFormatado.replace('.', '-');
    const horasParaChave = horaStr.replace(/:/g, '-');
    const chaveNo = `${ano}-${mes}-${dia}_${horasParaChave}-${micro}_${multChave}x`;

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
        console.log(`[RAILWAY - SALVO]: ${multFormatado}x às ${horaStr} (Horário de Brasília)`);
    } catch (err) {
        console.error("Erro no Firebase:", err);
    }
}

(async () => {
    console.log("Iniciando robô em modo otimizado...");

    const browser = await chromium.launch({ 
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080'
        ]
    });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: 'pt-BR'
    });
    
    const page = await context.newPage();

    // Mascarar atributos de automação
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Monitorizar respostas da API em background
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('payouts') || url.includes('history') || url.includes('stats')) {
            try {
                const text = await response.text();
                const matches = text.match(/\d+\.\d{2}x?/g);
                if (matches && matches.length > 0) {
                    const ultima = matches[0].replace('x', '');
                    await salvarNoFirebase(ultima);
                }
            } catch (e) {}
        }
    });

    console.log("Acessando o URL do Aviator...");
    try {
        await page.goto(AVIATOR_USER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
        console.log("Aviso de carregamento inicial:", e.message);
    }

    await page.waitForTimeout(10000);

    let ultimaVelaSalva = "";

    // Loop de verificação a cada 2 segundos
    setInterval(async () => {
        try {
            const frames = page.frames();
            let textoVela = null;

            for (const frame of frames) {
                try {
                    const el = await frame.$('.payouts-block .bubble-multiplier, .payout-item, app-stats-widget .bubble-multiplier, .bubble-multiplier, .payouts-wrapper span, [class*="payout"]');
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
                const limpo = textoVela.replace('x', '').replace(',', '.').trim();
                const valorNum = parseFloat(limpo);

                if (!isNaN(valorNum) && valorNum > 0) {
                    const valorAtualStr = valorNum.toFixed(2);
                    if (valorAtualStr !== ultimaVelaSalva) {
                        ultimaVelaSalva = valorAtualStr;
                        await salvarNoFirebase(valorAtualStr);
                    }
                }
            }
        } catch (e) {
            console.error("Erro no loop:", e.message);
        }
    }, 2000);
})();
