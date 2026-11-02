// Fase 6: extreu del DOM les xifres dels informes de l'app (Dashboard, Estat de Resultats, Flux d'Efectiu i Fons delegats) d'un exercici, perquè es
// puguen comparar entre l'app vella (main, amb el full) i la nova (branca supabase, amb Supabase). Serveix en les dues: només fa servir funcions que
// existeixen en totes dues versions. Es carrega al navegador després que l'app tinga les dades:  (0, eval)(text);  await __extreu('26/27')
window.__extreu = async function (af) {
  const dorm = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  canviarExercici(af, true);
  await dorm(300);
  const pg = async function (id, pagina) {
    showPage(pagina);
    await dorm(400);
    return document.getElementById('page-' + id).innerText.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  };
  const out = { af: af };
  showPage('dashboard');
  await dorm(300);
  renderDashboard();
  out.dashboard = ['m-ing', 'm-gast', 'm-net', 'm-count'].map(function (id) { return document.getElementById(id).textContent; }).join(' | ');
  out.resultats = await pg('resultats', 'resultats');
  out.flux = await pg('flux', 'flux');
  out.fons = await pg('lliurament', 'lliurament');
  return out;
};
