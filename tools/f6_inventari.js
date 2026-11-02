// Fase 6: inventari d'una persona contra l'app REAL i la base de dades REAL (pont tools/f6_pont.mjs + tools/f6_client.js; tot dins d'una transacció que es desfà).
//   (0, eval)(await (await fetch('/tools/f6_inventari.js')).text());  const r = await __inventari({ perRol: 'area' }, 'area');
// Segon paràmetre: el perfil esperat ('president', 'treasury', 'area', 'delegat', 'board', 'multi'). Torna { problemes: [...], ... }: buit = tot com s'esperava.
(function () {
  const dorm = (ms) => new Promise((r) => setTimeout(r, ms));
  const PAGINES = {
    dashboard: 'Dashboard', moviments: 'Nou moviment', lliurament: 'Fons delegats', tancament: "Caixa d'Event", 'pressupostos-edit': 'Pressupostos',
    historial: 'Historial', fallesapp: 'Falles.app', importacio: 'Importar CSV', resultats: 'Estat de Resultats', flux: "Flux d'Efectiu", reports: 'Reports',
    configuracio: 'Configuració', manual: "Manual d'usuari",
  };
  const TOTES = Object.keys(PAGINES);
  const D9 = ['dashboard', 'moviments', 'lliurament', 'tancament', 'pressupostos-edit', 'historial', 'resultats', 'reports', 'manual'];
  const ESPERAT = {
    president: { pagines: TOTES, barra: ['dashboard', 'moviments', 'lliurament', 'tancament'], escriu: true, config: ['Exercicis', 'Àrees', 'Events', 'Bancs', 'Rols i permisos', 'Regles CSV', 'Justificants', 'Usuaris', '🔍 Log'], historialEdita: true, canFons: true },
    treasury: { pagines: TOTES, barra: ['dashboard', 'moviments', 'lliurament', 'tancament'], escriu: true, config: ['Exercicis', 'Àrees', 'Events', 'Bancs', 'Rols i permisos', 'Regles CSV', 'Justificants', '🔍 Log'], historialEdita: true, canFons: true },
    area: { pagines: D9, barra: ['dashboard', 'moviments', 'lliurament', 'tancament'], escriu: true, config: null, historialEdita: false, canFons: false },
    delegat: { pagines: D9, barra: ['dashboard', 'moviments', 'lliurament', 'tancament'], escriu: true, config: null, historialEdita: false, canFons: false },
    // Junta (D-053): sense Nou moviment, Fons, Falles.app, Importar ni Flux; la barra: Dashboard i Caixa
    board: { pagines: ['dashboard', 'tancament', 'pressupostos-edit', 'historial', 'resultats', 'reports', 'manual'], barra: ['dashboard', 'tancament'], escriu: false, config: null, historialEdita: false, canFons: false },
    multi: { pagines: D9, barra: ['dashboard', 'moviments', 'lliurament', 'tancament'], escriu: true, config: null, historialEdita: false, canFons: false },
  };
  const igual = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());

  window.__inventari = async function (opcions, perfil) {
    const e = ESPERAT[perfil];
    const res = { perfil: perfil, problemes: [] };
    const mal = (t) => res.problemes.push(t);
    const erros = [];
    const h = (ev) => erros.push(ev.message);
    window.addEventListener('error', h);
    const info = await __f6.entra(opcions);
    res.rols = info.rols; res.moviments = info.moviments;
    if (!info.dades) { mal('les dades no s\'han carregat'); window.removeEventListener('error', h); return res; }

    // 1. Menú, barra i permisos
    const pagines = Array.prototype.map.call(document.querySelectorAll('#sb-nav .nav-item'), (n) => n.getAttribute('onclick').match(/showPage\('([^']+)'/)[1]);
    res.pagines = pagines;
    if (!igual(pagines, e.pagines)) mal(`menú: ${pagines.join(',')} ≠ esperat ${e.pagines.join(',')}`);
    const barra = navBarraIds();
    if (!igual(barra, e.barra)) mal(`barra mòbil: ${barra.join(',')} ≠ ${e.barra.join(',')}`);
    res.permisos = ['canRegister', 'canFons', 'canImport', 'canConfig', 'canUsers', 'viewAll'].filter(perm);
    if (perm('canFons') !== e.canFons) mal(`canFons ${perm('canFons')} ≠ ${e.canFons}`);
    if (modulEdita('historial') !== e.historialEdita) mal(`Historial en edició ${modulEdita('historial')} ≠ ${e.historialEdita}`);
    res.sidebarRol = document.getElementById('sb-role').textContent;

    // 2. Abast de dades
    res.abast = { arees: getMyArees().length, delegacions: getMyDelegacions().length, veTot: perm('viewAll') };
    if (perm('viewAll') && res.abast.delegacions !== DB.config.delegacions.length) mal('viewAll però no té totes les delegacions');
    if (!perm('viewAll') && perfil !== 'president' && res.abast.delegacions >= DB.config.delegacions.length) mal('sense viewAll però veu totes les delegacions');

    // 3. Totes les pantalles visibles carreguen sense errors ni canvis fantasma
    for (const p of pagines) { try { showPage(p); await dorm(250); } catch (x) { mal(`pantalla ${p}: ${x.message}`); } }
    if (sbHiHaPendents()) mal('canvis fantasma després de recórrer les pantalles');
    res.dashboard = ['m-ing', 'm-gast', 'm-net', 'm-count'].map((id) => document.getElementById(id).textContent).join(' | ');

    // 4. Configuració
    if (pagines.indexOf('configuracio') >= 0) {
      showPage('configuracio'); await dorm(300);
      const tabs = Array.prototype.map.call(document.querySelectorAll('#cfg-tabs-bar button'), (b) => b.textContent);
      res.configTabs = tabs;
      if (e.config && !igual(tabs, e.config)) mal(`pestanyes de Configuració: ${tabs.join(',')} ≠ ${e.config.join(',')}`);
      for (const t of ['exercicis', 'areas', 'events', 'bancs', 'rols', 'regles', 'justificants', 'usuaris', 'log']) { try { if (document.getElementById('cfg-tab-' + t)) { showCfgTab(t); await dorm(150); } } catch (x) { mal(`Configuració ${t}: ${x.message}`); } }
    }

    // 5. Historial: quants moviments pot editar (tots si té Historial en edició; si no, només els seus)
    if (pagines.indexOf('historial') >= 0) {
      showPage('historial'); await dorm(400);
      const files = document.querySelectorAll('#hist-tbody tr').length;
      const editables = document.querySelectorAll('#hist-tbody button[onclick^="openEditMov"]').length;
      res.historial = { files: files, editables: editables };
      if (e.historialEdita && files && editables !== files) mal(`Historial: només pot editar ${editables} de ${files}`);
      if (!e.historialEdita && editables === files && files > 0) mal('Historial: pot editar-ho tot sense tindre Historial en edició');
    }

    // 6. Escriure: un moviment nou pel formulari real, a la seua àrea i delegació
    if (e.escriu) {
      const delegs = getMyDelegacions();
      const dId = perm('viewAll') ? '0102' : delegs[0];
      const deleg = DB.config.delegacions.find((d) => d.id === dId);
      showPage('moviments'); await dorm(300);
      document.getElementById('btn-gast').click();
      document.getElementById('via-b1').click();   // el banc: l'efectiu pregunta d'on surt el diner (fons, avançament o caixa)
      const a = document.getElementById('mov-area'); a.value = deleg.areaId; a.dispatchEvent(new Event('change', { bubbles: true }));
      const d = document.getElementById('mov-deleg'); d.value = dId; d.dispatchEvent(new Event('change', { bubbles: true }));
      [['mov-import', '12,34'], ['mov-concept', 'Prova Fase 6'], ['mov-notes', 'Prova sense tiquet']].forEach(([id, v]) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } });
      const abans = DB.moviments.length;
      __f6.crides.length = 0;
      document.getElementById('btn-registrar').click();
      await dorm(200);
      registrarMoviment();
      await dorm(2500);
      const rpc = __f6.crides.filter((c) => c === 'rpc guarda_canvis').length;
      res.nouMoviment = { moviments: DB.moviments.length - abans, rpc: rpc, pendents: sbHiHaPendents(), toast: (document.getElementById('toast-msg') || document.getElementById('toast') || {}).textContent };
      if (DB.moviments.length - abans !== 1 || !rpc || sbHiHaPendents()) mal(`Nou moviment no s'ha desat: ${JSON.stringify(res.nouMoviment)}`);
    }

    // 7. Un canvi que NO pot fer (config: àrees) ha de ser rebutjat pel servidor (si el rol no té Configuració en edició)
    if (!perm('canConfig')) {
      const nom = DB.config.areas[0].name;
      DB.config.areas[0].name = nom + ' (prova)';
      let error = null;
      try { await save('config'); } catch (x) { error = x.message; }
      res.configRebutjada = error;
      if (!error) mal('un canvi de Configuració sense permís s\'ha acceptat');
      DB.config.areas[0].name = nom;
    }
    window.removeEventListener('error', h);
    if (erros.length) mal('errors de JavaScript: ' + erros.slice(0, 3).join(' | '));
    return res;
  };
})();
