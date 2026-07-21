// js/server.js — servidor HTTP para o frontend de entrada de dados do SODD
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT          = process.env.PORT || 3000;
const PUBLIC_DIR    = path.join(__dirname, 'public');
const CENARIO_FILE  = path.join(__dirname, 'cenario_editado.json');
const PYTHON_SCRIPT = path.join(__dirname, '..', 'otimizador', 'otimizador.py');
const TMP_INPUT     = path.join(__dirname, '..', 'otimizador', '_input_tmp.json');

// ── Helpers ───────────────────────────────────────────────────────────────────
function lerCorpo(req) {
    return new Promise(resolve => {
        let buf = '';
        req.on('data', c => { buf += c.toString(); });
        req.on('end', () => resolve(buf));
    });
}

function servirArquivo(res, filePath, tipo) {
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Não encontrado'); return; }
        res.writeHead(200, { 'Content-Type': tipo + '; charset=utf-8' });
        res.end(data);
    });
}

function json(res, data, status = 200) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
}

// ── Servidor ──────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];

    // CORS para desenvolvimento local
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── Arquivos estáticos ────────────────────────────────────────────────────
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
        servirArquivo(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html');
        return;
    }

    // ── GET /api/cenario — carregar cenário salvo ─────────────────────────────
    if (req.method === 'GET' && url === '/api/cenario') {
        if (fs.existsSync(CENARIO_FILE)) {
            servirArquivo(res, CENARIO_FILE, 'application/json');
        } else {
            json(res, {
                disciplinas: [], professores: [], salas: [], grupos: [],
                config: { alunosPorTurma: 45, capacidadeLabPadrao: 40,
                          horariosCriticos: ['M1', 'T3'], tempoSolver: 60 }
            });
        }
        return;
    }

    // ── POST /api/cenario — salvar cenário ────────────────────────────────────
    if (req.method === 'POST' && url === '/api/cenario') {
        const corpo = await lerCorpo(req);
        fs.writeFileSync(CENARIO_FILE, corpo, 'utf8');
        json(res, { ok: true });
        return;
    }

    // ── POST /api/otimizar — executar o solver ────────────────────────────────
    if (req.method === 'POST' && url === '/api/otimizar') {
        const corpo = await lerCorpo(req);

        // Escreve para arquivo temporário (evita limite de tamanho no argv do Windows)
        fs.writeFileSync(TMP_INPUT, corpo, 'utf8');

        const proc = spawn('python', [PYTHON_SCRIPT, TMP_INPUT]);
        let saida = '', erros = '';
        proc.stdout.on('data', d => { saida += d.toString(); });
        proc.stderr.on('data', d => { erros += d.toString(); });

        proc.on('close', code => {
            // Limpar arquivo temporário
            try { fs.unlinkSync(TMP_INPUT); } catch {}

            if (!saida.trim()) {
                json(res, { status: 'ERROR', message: erros || `Python saiu com código ${code}` });
                return;
            }
            try {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(saida.trim());
            } catch {
                json(res, { status: 'ERROR', message: 'Resposta inválida do solver' });
            }
        });
        return;
    }

    // ── Arquivos estáticos (css/js/etc. sob public/) ─────────────────────────
    if (req.method === 'GET') {
        const rel = decodeURIComponent(url).replace(/^\/+/, '');
        const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
        // proteção contra path traversal: precisa permanecer dentro de PUBLIC_DIR
        if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const TIPOS = {
                '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.mjs': 'text/javascript', '.json': 'application/json',
                '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
                '.ico': 'image/x-icon', '.map': 'application/json',
            };
            const ext = path.extname(filePath).toLowerCase();
            servirArquivo(res, filePath, TIPOS[ext] || 'application/octet-stream');
            return;
        }
    }

    res.writeHead(404);
    res.end('Rota não encontrada');
});

server.listen(PORT, () => {
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`   🌐  SODD Frontend: http://localhost:${PORT}`);
    console.log(`   Ctrl+C para encerrar`);
    console.log('═'.repeat(55) + '\n');
});
