/* EVS — interface (PWA). La logique de calcul est dans calc.js. */
(function () {
  'use strict';
  const C = window.EVSCalc;
  const KEY = 'evs_state_v1';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                'septembre', 'octobre', 'novembre', 'décembre'];
  const MOIS_C = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

  // ── État & stockage ────────────────────────────────────────────────────
  let state = load();
  const ui = { tab: 'planning', hideBackup: false };

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* stockage vide ou illisible */ }
    return C.normalize(s);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('⚠ Sauvegarde impossible : stockage plein ou bloqué'); }
  }

  // ── Utilitaires ────────────────────────────────────────────────────────
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = v => nf.format(v) + ' €';
  const diff = v => v > 0.005 ? '+' + nf.format(v) + ' €' : v < -0.005 ? nf.format(v) + ' €' : '0,00 €';
  const dcls = v => v > 0.01 ? 'pos' : v < -0.01 ? 'neg' : 'zero';
  const num = s => { const v = parseFloat(String(s == null ? '' : s).replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? null : v; };
  const fld = v => (v > 0 ? String(v).replace('.', ',') : '');
  const monthKey = () => state.annee + '-' + C.pad2(state.mois);
  const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function shift(delta) {
    state.mois += delta;
    if (state.mois > 12) { state.mois = 1; state.annee++; }
    if (state.mois < 1) { state.mois = 12; state.annee--; }
    save(); render();
  }
  const navBar = (title, label) => `<div class="nav no-print">
    <button class="btn-nav" data-nav="-1" aria-label="${label} précédent">◀</button><h2>${title}</h2>
    <button class="btn-nav" data-nav="1" aria-label="${label} suivant">▶</button></div>`;
  const rowH = (a, b, cls) => `<div class="row ${cls || ''}"><span>${a}</span><span>${b}</span></div>`;

  // ── Onglet PLANNING ────────────────────────────────────────────────────
  function viewPlanning() {
    const y = state.annee, m = state.mois, n = C.dim(y, m);
    const first = (new Date(y, m - 1, 1).getDay() + 6) % 7, weeks = Math.ceil((first + n) / 7);
    const now = new Date(), today = C.ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const dt = new Date(y, m - 1, 1 - first + i), dd = dt.getDate();
      if (dt.getMonth() + 1 !== m || dt.getFullYear() !== y) { cells += `<div class="cell out"><span class="num">${dd}</span></div>`; continue; }
      const ds = C.ymd(y, m, dd), j = C.getJ(state, ds), ty = C.TYPES[j.t], we = C.WE.includes(j.t);
      const wk = dt.getDay() === 0 || dt.getDay() === 6;
      cells += `<button class="cell${wk ? ' wk' : ''}${ds === today ? ' today' : ''}" data-d="${ds}" aria-label="${dd} ${MOIS[m - 1]} : ${j.t}">
        <span class="num">${dd}</span>
        <span class="type" style="background:${ty.c};${ty.fg ? 'color:' + ty.fg : ''}">${j.t}</span>
        <span class="marks"><i class="m dp${j.dp ? ' on' : ''}">DP</i><i class="m re${j.re ? ' on' : ''}">R</i><i class="m ti${we ? ' we' : (j.ti ? ' on' : '')}">${we ? '4Ti' : 'Ti'}</i></span></button>`;
    }
    let banner = '';
    if (isIOS() && !isStandalone() && !localStorage.getItem('evs_hide_install')) {
      banner += `<div class="banner" id="b-install"><span>📲 Pour installer EVS : touchez <b>Partager</b> puis <b>Sur l’écran d’accueil</b>. Vos données restent ainsi mieux conservées.</span><button data-act="hide-install" aria-label="Fermer">✕</button></div>`;
    }
    const nbSaisies = Object.keys(state.planning).length;
    const old = !state.lastBackup || (Date.now() - new Date(state.lastBackup).getTime()) > 30 * 864e5;
    if (nbSaisies >= 5 && old && !ui.hideBackup) {
      banner += `<div class="banner"><span>💾 Pensez à sauvegarder vos données (onglet <b>Agent</b> → Sauvegarde).</span><button data-act="hide-backup" aria-label="Fermer">✕</button></div>`;
    }
    return banner + navBar(MOIS[m - 1] + ' ' + y, 'Mois') + `
      <div class="dow">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => `<div>${d}</div>`).join('')}</div>
      <div class="grid">${cells}</div>
      <p class="hint">Touchez un jour pour saisir son type, DP, repas et Ti.</p>`;
  }

  function openDay(ds) {
    const j = Object.assign({}, C.getJ(state, ds));
    const low = state.agent.classe <= 4;
    const work = ['TJ', 'TJ4', 'TN', 'TN4', 'T4'];
    const rest = ['RP'].concat(low ? ['RP1', 'RU'] : ['RQ'], ['RN', 'MN', 'C', 'F']);
    const [y, m, d] = ds.split('-').map(Number);
    const title = new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const btn = t => `<button type="button" data-t="${t}" style="background:${C.TYPES[t].c};${C.TYPES[t].fg ? 'color:' + C.TYPES[t].fg : ''}" class="${j.t === t ? 'sel' : ''}">${t}</button>`;
    const md = $('#modal');
    md.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Saisie du ${esc(title)}">
      <h3>${esc(title)}</h3>
      <h4>Travail</h4><div class="types">${work.map(btn).join('')}</div>
      <h4>Repos / absences</h4><div class="types">${rest.map(btn).join('')}</div>
      <h4>Options</h4><div class="checks">
        <label><input type="checkbox" id="c-dp" ${j.dp ? 'checked' : ''}> DP (déplacement)</label>
        <label><input type="checkbox" id="c-re" ${j.re ? 'checked' : ''}> Repas</label>
        <label><input type="checkbox" id="c-ti" ${j.ti ? 'checked' : ''}> Ti</label>
        <p class="hint" id="i-we" hidden>T4 / TJ4 / TN4 : 4 Ti comptés automatiquement.</p></div>
      <div class="btns"><button class="btn" id="m-cancel">Annuler</button><button class="btn primary" id="m-ok">OK</button></div></div>`;
    md.hidden = false;
    const upd = () => {
      const we = C.WE.includes(j.t), ti = $('#c-ti');
      ti.disabled = we; if (we) ti.checked = false; $('#i-we').hidden = !we;
      md.querySelectorAll('.types button').forEach(b => b.classList.toggle('sel', b.dataset.t === j.t));
    };
    upd();
    md.querySelectorAll('.types button').forEach(b => b.onclick = () => { j.t = b.dataset.t; upd(); });
    const close = () => { md.hidden = true; md.innerHTML = ''; };
    $('#m-cancel').onclick = close;
    md.onclick = e => { if (e.target === md) close(); };
    $('#m-ok').onclick = () => {
      j.dp = $('#c-dp').checked; j.re = $('#c-re').checked;
      j.ti = C.WE.includes(j.t) ? 0 : $('#c-ti').checked;
      C.setJ(state, ds, j); save(); close(); render();
    };
  }

  // ── Onglet MENSUEL ─────────────────────────────────────────────────────
  function viewMensuel() {
    const y = state.annee, m = state.mois, r = C.resumeMois(state, y, m), t = r.t, ag = state.agent;
    const chips = [['TJ', t.tj], ['TN', t.tn], ['T4', t.nWe / 4], ['RP', t.rp], ['RQ', t.rq], ['RU', t.ru],
                   ['RN', t.rn], ['C', t.c], ['F', t.f], ['MN', t.mn]].filter(c => c[1] > 0)
      .map(c => `<span class="chip" style="background:${C.TYPES[c[0]].c};${C.TYPES[c[0]].fg ? 'color:' + C.TYPES[c[0]].fg : ''}">${c[0]} : ${c[1]}</span>`).join('');
    const pctTxt = ag.pct > 0 ? ag.pct + ' %' : 'non renseigné (brut affiché tel quel)';
    return navBar(MOIS[m - 1] + ' ' + y, 'Mois') + `
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      <div class="card"><h3>Primes de base</h3>
        ${rowH(`DP × ${t.nDp}`, eur(t.eDp))}${rowH(`Repas × ${t.nRe}`, eur(t.eRe))}${rowH(`Ti × ${t.nTi}`, eur(t.eTi))}</div>
      <div class="card"><h3>Brut</h3>
        ${rowH('Ti', eur(t.eTi))}${rowH('Autres indemnités', eur(r.autres))}${rowH('Sous-total brut', eur(r.brut), 'sub')}</div>
      <div class="card"><h3>Net</h3>
        ${rowH('Alloc. nuit sédentaire (KM9)', eur(r.km9))}${rowH('Alloc. DP + repas', eur(t.alloc))}${rowH('Sous-total net', eur(r.net), 'sub')}</div>
      <div class="hl"><span>TOTAL HORS SALAIRE</span><b>${eur(r.horsSalaire)}</b></div>
      <p class="hint">Brut converti en net (${esc(pctTxt)}) + sous-total net.</p>

      <details class="sens no-print"><summary>🔒 Salaire et prime de ce mois</summary>
        <p class="hint">% cotisations (depuis l’onglet Agent) : ${esc(pctTxt)}</p>
        <label for="s-s">Salaire brut</label>
        <input id="s-s" inputmode="decimal" autocomplete="off" placeholder="Valeur par défaut : onglet Agent" value="${esc(fld(r.inf.s))}">
        <label for="s-p">Prime travail/ancienneté brute</label>
        <input id="s-p" inputmode="decimal" autocomplete="off" placeholder="Valeur par défaut : onglet Agent" value="${esc(fld(r.inf.p))}">
        <div class="btns"><button class="btn ok" data-act="save-sal">💾 Enregistrer</button>
          ${r.inf.surcharge ? '<button class="btn" data-act="reset-sal">↩ Valeurs Agent</button>' : ''}</div>
        <p class="warn">⚠ Modification suite à augmentation salariale non comprise sur le mois concerné</p>
      </details>

      <div class="card"><h3>Total mensuel (avec salaire et primes)</h3>
        ${rowH('Salaire (net)', eur(r.salNet))}${rowH('Prime travail/ancienneté (net)', eur(r.primeNet))}
        ${rowH('Sous-total (primes diverses)', eur(r.horsSalaire))}
        ${rowH('TOTAL MENSUEL NET', eur(r.total), 'big')}</div>`;
  }

  // ── Onglet ANNUEL ──────────────────────────────────────────────────────
  function viewAnnuel() {
    const y = state.annee, low = state.agent.classe <= 4;
    let tT = 0, tD = 0, tR = 0, tET = 0, tA = 0, tFT = 0, tFA = 0, tC = 0, tRq = 0, tRu = 0, tRn = 0, body = '';
    for (let m = 1; m <= 12; m++) {
      const t = C.totauxMois(state, y, m), f = C.ficheMois(state, y, m);
      const dT = f.ti - t.eTi, dA = f.alloc - t.alloc;
      tT += t.nTi; tD += t.nDp; tR += t.nRe; tET += t.eTi; tA += t.alloc; tFT += f.ti; tFA += f.alloc;
      tC += t.c; tRq += t.rq; tRu += t.ru; tRn += t.rn;
      body += `<tr class="click" data-m="${m}"><td><b>${MOIS_C[m - 1]}</b></td><td>${t.nTi}</td><td>${t.nDp}</td><td>${t.nRe}</td>
        <td>${nf.format(t.eTi)}</td><td>${nf.format(t.alloc)}</td><td class="${dcls(dT)}">${diff(dT).replace(' €', '')}</td><td class="${dcls(dA)}">${diff(dA).replace(' €', '')}</td></tr>`;
    }
    const dT = tFT - tET, dA = tFA - tA;
    return `<div class="nav no-print"><button class="btn-nav" data-nav="-1" aria-label="Année précédente">◀</button><h2>Totaux ${y}</h2>
      <button class="btn-nav" data-nav="1" aria-label="Année suivante">▶</button></div>
      <div class="card scroll"><table><thead><tr><th>Mois</th><th>Ti</th><th>DP</th><th>Rep.</th><th>€ Ti</th><th>Alloc.</th><th>Δ Ti</th><th>Δ Alloc</th></tr></thead>
      <tbody>${body}<tr class="tot"><td>TOTAL</td><td>${tT}</td><td>${tD}</td><td>${tR}</td><td>${nf.format(tET)}</td><td>${nf.format(tA)}</td><td>${diff(dT).replace(' €', '')}</td><td>${diff(dA).replace(' €', '')}</td></tr></tbody></table></div>
      <p class="hint">Δ = fiche de paye − calcul EVS. Les montants de la fiche viennent de l’onglet Vérif. Touchez un mois pour l’ouvrir.</p>
      <div class="card"><h3>Totaux de l’année</h3>
        ${rowH(`Ti × ${tT}`, eur(tET))}${rowH(`DP × ${tD}`, eur(tD ? tD * state.tarifs.klc : 0))}${rowH('Alloc. DP + repas', eur(tA))}
        ${rowH('Écart Ti', `<span class="${dcls(dT)}">${diff(dT)}</span>`)}${rowH('Écart alloc.', `<span class="${dcls(dA)}">${diff(dA)}</span>`)}
        ${rowH('Congés (C)', tC)}${rowH(low ? 'RU' : 'RQ', low ? tRu : tRq)}${rowH('RN', `${tRn} (${nf.format(tRn * 7.75)} h)`)}</div>`;
  }

  // ── Onglet VÉRIF PAYE ──────────────────────────────────────────────────
  const TARIF_CHAMPS = [['ti01', 'Ti (TI01)'], ['lq4', 'LQ4 — supp. nuit WE'], ['lq0', 'LQ0 — ind. spéciale nuit'],
    ['l65', 'L65/IS02 — nuit taux 2'], ['lb6', 'LB6 — nuit taux 1'], ['le6', 'LE6 — milieu de nuit'],
    ['km9', 'KM9 — alloc nuit séd.'], ['km5', 'KM5 — compl. alloc séd.'], ['dimFete', 'Dimanche et fêtes'],
    ['cvb01a', 'CVB01 taux A'], ['cvb01b', 'CVB01 taux B'], ['kla', 'KLA — repas'], ['klc', 'KLC — DP complet'],
    ['forfaitJours', 'Forfait jours']];

  function viewVerif() {
    const y = state.annee, m = state.mois, v = C.calculVerif(state, y, m), ag = state.agent;
    const saved = state.ficheVerif[monthKey()] || {};
    let rows = '';
    v.lignes.forEach(l => {
      const forfait = l.code === 'FORFAIT';
      const val = forfait ? l.total : saved[l.code];
      rows += `<tr><td class="desig">${esc(l.desig)}</td><td>${l.qte}</td><td>${nf.format(l.total)}</td>
        <td><input class="v-in" inputmode="decimal" autocomplete="off" data-code="${l.code}" data-calc="${l.total}" ${forfait ? 'disabled' : ''}
          value="${val > 0 ? esc(nf.format(val).replace(/\s/g, '')) : ''}"></td>
        <td id="ec-${l.code}" class="zero">0,00</td></tr>`;
    });
    const tarifs = TARIF_CHAMPS.map(([k, lab]) => `<label for="t-${k}">${lab}</label>
      <input id="t-${k}" inputmode="decimal" autocomplete="off" data-tarif="${k}" value="${esc(nf.format(state.tarifs[k]).replace(/\s/g, ''))}">`).join('');
    return navBar(MOIS[m - 1] + ' ' + y, 'Mois') + `
      <div class="print-only"><h2>Vérification de paye — ${MOIS[m - 1]} ${y}</h2>
        <p>${esc(ag.nom)} · CP ${esc(ag.cp)} · UO ${esc(ag.uo)} · Groupe ${esc(ag.groupe)}</p></div>
      <details class="sens no-print"><summary>⚙ Tarifs</summary>${tarifs}
        <div class="btns"><button class="btn primary" data-act="save-tarifs">Enregistrer les tarifs</button></div></details>
      <p class="hint">Nuits TN ce mois : <b>${v.nuits}</b> — saisissez le <b>montant</b> figurant sur la fiche de paye pour chaque ligne.</p>
      <div class="card scroll"><table><thead><tr><th>Désignation</th><th>Qté</th><th>Calculé</th><th>Fiche €</th><th>Écart</th></tr></thead>
      <tbody>${rows}<tr class="tot"><td>TOTAL</td><td></td><td>${nf.format(v.totalCalcule)}</td><td id="tot-fiche">0,00</td><td id="tot-ecart">0,00</td></tr></tbody></table></div>
      <div class="btns no-print"><button class="btn ok" data-act="save-verif">💾 Enregistrer la fiche</button>
        <button class="btn" data-act="print">🖨 Imprimer / PDF</button></div>`;
  }

  function updateVerifEcarts() {
    let tf = 0, te = 0;
    document.querySelectorAll('.v-in').forEach(inp => {
      const calc = parseFloat(inp.dataset.calc), f = num(inp.value) || 0, e = f - calc;
      const cell = document.getElementById('ec-' + inp.dataset.code);
      cell.textContent = (e >= 0 ? '+' : '') + nf.format(e); cell.className = dcls(e);
      tf += f; te += e;
    });
    const el = document.getElementById('tot-ecart');
    if (el) { document.getElementById('tot-fiche').textContent = nf.format(tf); el.textContent = (te >= 0 ? '+' : '') + nf.format(te); }
  }

  // ── Onglet AGENT ───────────────────────────────────────────────────────
  function viewAgent() {
    const a = state.agent;
    const cls = [1, 2, 3, 4, 5].map(c => `<label><input type="radio" name="classe" value="${c}" ${a.classe === c ? 'checked' : ''}><span>${c}</span></label>`).join('');
    const bk = state.lastBackup ? new Date(state.lastBackup).toLocaleDateString('fr-FR') : 'jamais';
    return `<div class="card"><h3>Informations</h3>
        <label for="a-nom">Nom</label><input id="a-nom" data-agent="nom" value="${esc(a.nom)}" autocomplete="off">
        <label for="a-cp">CP</label><input id="a-cp" data-agent="cp" value="${esc(a.cp)}" autocomplete="off">
        <label for="a-uo">UO</label><input id="a-uo" data-agent="uo" value="${esc(a.uo)}" autocomplete="off">
        <label for="a-gr">Groupe</label><input id="a-gr" data-agent="groupe" value="${esc(a.groupe)}" autocomplete="off"></div>
      <div class="card"><h3>Classe et options</h3>
        <div class="seg" role="radiogroup" aria-label="Classe">${cls}</div>
        ${a.classe <= 4 ? `<label>Taux conduite</label><div class="seg">
          <label><input type="radio" name="taux" value="A" ${!a.tauxB ? 'checked' : ''}><span>Taux A</span></label>
          <label><input type="radio" name="taux" value="B" ${a.tauxB ? 'checked' : ''}><span>Taux B</span></label></div>` : ''}
        ${a.classe === 5 ? `<div class="switch"><span>Forfait jours</span><input type="checkbox" id="a-fj" ${a.forfait ? 'checked' : ''}></div>` : ''}</div>
      <details class="sens no-print"><summary>🔒 Informations salariales (confidentiel)</summary>
        <label for="a-sal">Salaire mensuel brut de référence</label>
        <input id="a-sal" inputmode="decimal" autocomplete="off" placeholder="Ex : 2500,00" value="${esc(fld(a.salaire))}">
        <label for="a-prime">Prime travail/ancienneté mensuelle brute de référence</label>
        <input id="a-prime" inputmode="decimal" autocomplete="off" placeholder="Ex : 300,00" value="${esc(fld(a.prime))}">
        <label for="a-pct">% de cotisations (ce qui est enlevé du brut)</label>
        <input id="a-pct" inputmode="decimal" autocomplete="off" placeholder="Ex : 25 (entre 17 et 30)" value="${esc(fld(a.pct))}">
        <p class="hint">1000 € brut − 25 % = 750 € net. Ces valeurs s’appliquent à tous les mois ; une augmentation en cours d’année se saisit dans l’onglet Mensuel.</p>
      </details>
      <div class="btns"><button class="btn ok" data-act="save-agent">💾 Enregistrer</button></div>
      <div class="card" style="margin-top:14px"><h3>Sauvegarde</h3>
        <p class="hint">Vos données sont stockées <b>uniquement sur cet appareil</b>. Dernière sauvegarde : <b>${bk}</b>.
        Le fichier JSON contient aussi vos données salariales : conservez-le en lieu sûr.</p>
        <div class="btns"><button class="btn primary" data-act="exp-json">⬇ Sauvegarde complète (JSON)</button>
          <button class="btn" data-act="exp-csv">⬇ Planning ${state.annee} (CSV)</button>
          <button class="btn" data-act="imp">⬆ Importer (JSON ou CSV)</button></div></div>`;
  }

  function readAgentFields() {
    const a = state.agent, g = id => { const e = document.getElementById(id); return e ? e.value : null; };
    ['nom', 'cp', 'uo', 'groupe'].forEach(k => { const e = $('[data-agent="' + k + '"]'); if (e) a[k] = e.value.trim(); });
    const sal = g('a-sal'), pr = g('a-prime'), pc = g('a-pct');
    if (sal !== null) a.salaire = num(sal) || 0;
    if (pr !== null) a.prime = num(pr) || 0;
    if (pc !== null) a.pct = Math.min(Math.max(num(pc) || 0, 0), 99);
  }

  // ── Actions ────────────────────────────────────────────────────────────
  async function shareOrDownload(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    try {
      const file = new File([blob], name, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  const ACTIONS = {
    'hide-install': () => { localStorage.setItem('evs_hide_install', '1'); render(); },
    'hide-backup': () => { ui.hideBackup = true; render(); },
    'save-sal': () => {
      const s = num($('#s-s').value), p = num($('#s-p').value);
      state.salaires[monthKey()] = { s: s == null ? state.agent.salaire : s, p: p == null ? state.agent.prime : p };
      save(); toast('✓ Enregistré pour ' + MOIS[state.mois - 1] + ' ' + state.annee); render();
    },
    'reset-sal': () => { delete state.salaires[monthKey()]; save(); toast('Valeurs de l’onglet Agent rétablies'); render(); },
    'save-tarifs': () => {
      document.querySelectorAll('[data-tarif]').forEach(i => { const v = num(i.value); if (v != null) state.tarifs[i.dataset.tarif] = v; });
      save(); toast('✓ Tarifs enregistrés'); render();
    },
    'save-verif': () => {
      const o = {};
      document.querySelectorAll('.v-in').forEach(i => { const v = num(i.value); if (!i.disabled && v != null && v > 0) o[i.dataset.code] = v; });
      if (Object.keys(o).length) state.ficheVerif[monthKey()] = o; else delete state.ficheVerif[monthKey()];
      save(); toast('✓ Fiche enregistrée');
    },
    'print': () => window.print(),
    'save-agent': () => { readAgentFields(); save(); toast('✓ Informations enregistrées'); render(); },
    'exp-json': async () => {
      readAgentFields();
      if (await shareOrDownload('EVS_sauvegarde_' + stamp() + '.json', JSON.stringify(state), 'application/json')) {
        state.lastBackup = new Date().toISOString(); save(); render(); toast('✓ Sauvegarde exportée');
      }
    },
    'exp-csv': async () => {
      if (await shareOrDownload('EVS_planning_' + state.annee + '.csv', '\ufeff' + C.exportCsv(state, state.annee), 'text/csv')) toast('✓ CSV exporté');
    },
    'imp': () => { const f = $('#file'); f.value = ''; f.click(); }
  };

  function onFile(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const txt = String(rd.result).replace(/^\ufeff/, '');
      if (txt.trim().startsWith('{')) {
        let o; try { o = JSON.parse(txt); } catch (err) { toast('⚠ Fichier JSON illisible'); return; }
        if (!o || typeof o !== 'object' || !o.planning || !o.agent) { toast('⚠ Ce n’est pas une sauvegarde EVS'); return; }
        if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
        state = C.normalize(o); save(); render(); toast('✓ Sauvegarde restaurée');
      } else {
        const res = C.importCsv(state, txt);
        if (res.ok) { save(); render(); toast('✓ ' + res.msg); } else toast('⚠ ' + res.msg);
      }
    };
    rd.onerror = () => toast('⚠ Lecture du fichier impossible');
    rd.readAsText(f, 'UTF-8');
  }

  // ── Rendu & événements ─────────────────────────────────────────────────
  const VIEWS = { planning: viewPlanning, mensuel: viewMensuel, annuel: viewAnnuel, verif: viewVerif, agent: viewAgent };
  function render() {
    $('#view').innerHTML = VIEWS[ui.tab]();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
    $('#top-sub').textContent = state.agent.nom ? state.agent.nom : 'Congés et primes';
    if (ui.tab === 'verif') updateVerifEcarts();
  }

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { ui.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      const d = parseInt(nav.dataset.nav, 10);
      if (ui.tab === 'annuel') { state.annee += d; save(); render(); } else shift(d);
      return;
    }
    const day = e.target.closest('[data-d]'); if (day) { openDay(day.dataset.d); return; }
    const mrow = e.target.closest('[data-m]'); if (mrow) { state.mois = +mrow.dataset.m; ui.tab = 'mensuel'; save(); render(); return; }
    const act = e.target.closest('[data-act]'); if (act && ACTIONS[act.dataset.act]) ACTIONS[act.dataset.act]();
  });

  document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('v-in')) updateVerifEcarts(); });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'classe') { state.agent.classe = +t.value; if (state.agent.classe > 4) state.agent.tauxB = false; if (state.agent.classe !== 5) state.agent.forfait = false; readAgentFields(); save(); render(); }
    else if (t.name === 'taux') { state.agent.tauxB = t.value === 'B'; save(); }
    else if (t.id === 'a-fj') { state.agent.forfait = t.checked; save(); }
    else if (ui.tab === 'agent' && (t.dataset.agent || /^a-(sal|prime|pct)$/.test(t.id))) { readAgentFields(); save(); }
  });

  $('#file').addEventListener('change', onFile);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) { $('#modal').hidden = true; $('#modal').innerHTML = ''; } });
  // Confidentialité : on referme les sections masquées dès que l'appli passe en arrière-plan
  document.addEventListener('visibilitychange', () => { if (document.hidden && $('#modal').hidden) render(); });

  // Demande de stockage persistant (limite la purge automatique par le navigateur)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  render();
})();
