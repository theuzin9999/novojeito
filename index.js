const { chromium } = require('playwright');

const FIREBASE_URL = "https://history-dashboard-a70ee-default-rtdb.firebaseio.com/history";
const AVIATOR_USER_URL = process.env.AVIATOR_USER_URL || "COLE_AQUI_O_SEU_URL_COMPLETO";

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

    // Mascarar atributos de automação no navegador
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Monitorizar respostas de rede à procura da API do Aviator
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
    let tentativasSemSucesso = 0;

    setInterval(async () => {
        try {
            const frames = page.frames();
            let textoVela = null;

            for (const frame of frames) {
                try {
                    // Seletores abrangentes incluindo a classe padrão Spribe e wrappers
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
                tentativasSemSucesso = 0;
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
                tentativasSemSucesso++;
                if (tentativasSemSucesso === 5) {
                    const title = await page.title();
                    console.log(`[DIAGNOSTICO]: Título da página carregada: "${title}"`);
                    console.log(`[DIAGNOSTICO]: Total de frames encontrados na página: ${frames.length}`);
                } else if (tentativasSemSucesso % 15 === 0) {
                    console.log("[STATUS]: Re-verificando seletores e estrutura da página...");
                }
            }
        } catch (e) {
            console.error("Erro no loop:", e.message);
        }
    }, 2000);
})();
