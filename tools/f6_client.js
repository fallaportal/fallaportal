// Fase 6: part del navegador del pont (tools/f6_pont.mjs). Es carrega a la consola o amb javascript_tool, DESPRÉS que l'app haja arrancat:
//   const t = await (await fetch('/tools/f6_client.js')).text(); (0, eval)(t);  await __f6.entra('correu@exemple.cat', 'TOKEN');
// Substitueix els mètodes de `sb` (supabase-js) perquè l'app real parle amb el pont: cada consulta s'executa a la base de dades com la persona indicada.
// No és codi de l'app: mai es carrega des d'index.html.
(function () {
  const BASE = 'http://127.0.0.1:8898';
  const F6 = window.__f6 = { token: null, sessio: null, crides: [] };
  async function crida(c) {
    const r = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ ...c, token: F6.token, sessio: F6.sessio }) });
    return r.json();
  }
  F6.crida = crida;
  sb.from = function (taula) {
    const q = { op: 'select', taula: taula, cols: '*', filtres: [], ordre: [], rang: null, limit: null, dades: null };
    const o = {
      select(c) { q.cols = c; return o; },
      insert(d) { q.op = 'insert'; q.dades = d; return o; },
      update(d) { q.op = 'update'; q.dades = d; return o; },
      delete() { q.op = 'delete'; return o; },
      eq(c, v) { q.filtres.push([c, v]); return o; },
      order(c, opts) { q.ordre.push([c, !(opts && opts.ascending === false)]); return o; },
      range(a, b) { q.rang = [a, b]; return o; },
      limit(n) { q.limit = n; return o; },
      then(res, rej) { F6.crides.push(q.op + ' ' + taula); return crida(q).then(res, rej); },
    };
    return o;
  };
  sb.rpc = function (nom, args) { F6.crides.push('rpc ' + nom); return crida({ op: 'rpc', nom: nom, args: args }); };
  Object.defineProperty(sb, 'storage', {
    configurable: true,
    value: { from: function () { return {
      upload: async function (ruta) { return crida({ op: 'storage_up', ruta: ruta }); },
      remove: async function (rutes) { return crida({ op: 'storage_rm', rutes: rutes }); },
      createSignedUrl: async function (ruta) { return { data: { signedUrl: 'about:blank#signada-' + ruta }, error: null }; },
    }; } },
  });
  sb.channel = function () { return { on: function () { return this; }, subscribe: function () { return this; } }; };
  sb.removeChannel = function () {};
  // Entra com una persona: obri la sessió al pont i dispara l'esdeveniment d'Auth que fa servir l'app.
  // opcions: { email } | { perRol: 'area' } | { crea: { rols: ['board'], delegacions: ['0101'], arees: [] } }
  F6.entra = async function (opcions, token) {
    if (typeof opcions === 'string') opcions = { email: opcions };
    if (token) F6.token = token;
    if (F6.sessio) await crida({ op: 'tanca' });
    tancaLocal(); document.getElementById('app').classList.add('hidden');
    const r = await crida({ op: 'sessio', ...opcions });
    if (r.error) throw new Error(r.error.message);
    F6.sessio = r.data.id; F6.email = r.data.email; F6.crides.length = 0;
    await sb.auth._notifyAllSubscribers('SIGNED_IN', { access_token: 'a', refresh_token: 'r', user: { email: r.data.email } });
    for (let i = 0; i < 150 && !dadesCarregades; i++) await new Promise(function (r2) { setTimeout(r2, 100); });
    return { rols: getRolsPropis(), dades: dadesCarregades, moviments: (DB.moviments || []).length };
  };
  F6.tanca = async function () { if (F6.sessio) { await crida({ op: 'tanca' }); F6.sessio = null; } };
  window.confirm = function () { return true; };
  window.prompt = function () { return 'motiu de prova'; };
})();
