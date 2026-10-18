/* EVS — logique de calcul (port fidèle de l'application Android).
   Module pur : aucune dépendance au DOM, testable sous Node. */
(function (root) {
  'use strict';

  // ── Types de journée ───────────────────────────────────────────────────
  const TYPES = {
    TJ:  { c: '#F1C40F', fg: '#1b1b1b' },
    TN:  { c: '#1A5276' },
    T4:  { c: '#8E44AD' },
    TJ4: { c: '#E91E8C' },
    TN4: { c: '#6A1B9A' },
    RP:  { c: '#27AE60' },
    RP1: { c: '#1E8449' },
    RQ:  { c: '#E67E22' },
    RU:  { c: '#D35400' },
    RN:  { c: '#2471A3' },
    MN:  { c: '#F39C12', fg: '#1b1b1b' },
    C:   { c: '#8E44AD' },
    F:   { c: '#E74C3C' }
  };
  const WE = ['T4', 'TJ4', 'TN4'];                       // week-end : 4 Ti automatiques
  const TRAVAIL_DIM = ['TJ', 'TN', 'T4', 'TJ4', 'TN4'];   // dimanche travaillé
  const CONDUITE = ['TJ', 'TN', 'TJ4', 'TN4'];            // jours de conduite (CVB01)

  const DEFAULT_TARIFS = {
    ti01: 13.82, cvb01a: 4.86, cvb01b: 10.38, lq4: 11.91, lq0: 5.14,
    l65: 3.35, lb6: 3.68, le6: 0.24, km9: 7.40, km5: 3.79,
    dimFete: 5.78, kla: 20.50, klc: 82.00, forfaitJours: 58.43
  };

  // ── Dates (sans fuseau : on manipule des entiers) ──────────────────────
  const pad2 = n => String(n).padStart(2, '0');
  const ymd = (y, m, d) => y + '-' + pad2(m) + '-' + pad2(d);
  const dim = (y, m) => new Date(y, m, 0).getDate();
  const dow = (y, m, d) => new Date(y, m - 1, d).getDay();   // 0 = dimanche
  function isoWeek(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }

  // ── État ───────────────────────────────────────────────────────────────
  function normalize(s) {
    const now = new Date();
    const d = {
      v: 1, annee: now.getFullYear(), mois: now.getMonth() + 1,
      planning: {},                       // "YYYY-MM-DD" -> {t,dp,re,ti} (seulement les jours modifiés)
      agent: { nom: '', cp: '', uo: '', groupe: '', classe: 5, tauxB: false,
               forfait: false, salaire: 0, prime: 0, pct: 0 },
      salaires: {},                       // "YYYY-MM" -> {s,p} (surcharge du mois)
      tarifs: Object.assign({}, DEFAULT_TARIFS),
      ficheVerif: {},                     // "YYYY-MM" -> {CODE: montant fiche}
      fiches: {},                         // "YYYY-MM" -> [ti, alloc] (import CSV de l'APK)
      lastBackup: null
    };
    if (!s || typeof s !== 'object') return d;
    return Object.assign(d, s, {
      agent: Object.assign(d.agent, s.agent || {}),
      tarifs: Object.assign(d.tarifs, s.tarifs || {}),
      planning: s.planning || {}, salaires: s.salaires || {},
      ficheVerif: s.ficheVerif || {}, fiches: s.fiches || {}
    });
  }

  const DEFAULT_J = { t: 'RP', dp: 0, re: 0, ti: 0 };
  const getJ = (st, ds) => st.planning[ds] || DEFAULT_J;
  function setJ(st, ds, j) {
    if (j.t === 'RP' && !j.dp && !j.re && !j.ti) delete st.planning[ds];
    else st.planning[ds] = { t: j.t, dp: j.dp ? 1 : 0, re: j.re ? 1 : 0, ti: j.ti ? 1 : 0 };
  }
  const nbreTi = j => WE.includes(j.t) ? 4 : (j.ti ? 1 : 0);
  const nbreWe = j => WE.includes(j.t) ? 4 : 0;
  const isNuit = j => j.t === 'TN' || j.t === 'TN4';

  // ── Totaux du mois (getTotauxMois) ─────────────────────────────────────
  function totauxMois(st, y, m) {
    const t = st.tarifs;
    const o = { nDp: 0, nRe: 0, nTi: 0, nWe: 0, rp: 0, rq: 0, ru: 0, rn: 0, c: 0, f: 0, tj: 0, tn: 0, mn: 0 };
    for (let d = 1; d <= dim(y, m); d++) {
      const j = getJ(st, ymd(y, m, d));
      if (j.dp) o.nDp++;
      if (j.re) o.nRe++;
      o.nTi += nbreTi(j);
      o.nWe += nbreWe(j);
      switch (j.t) {
        case 'RP': case 'RP1': o.rp++; break;
        case 'RQ': o.rq++; break;
        case 'RU': o.ru++; break;
        case 'RN': o.rn++; break;
        case 'C': o.c++; break;
        case 'F': o.f++; break;
        case 'TJ': case 'TJ4': o.tj++; break;
        case 'TN': case 'TN4': o.tn++; break;
        case 'MN': o.mn++; break;
      }
    }
    o.eDp = o.nDp * t.klc;
    o.eRe = o.nRe * t.kla;
    o.eTi = o.nTi * t.ti01;
    o.alloc = o.eDp + o.eRe;
    return o;
  }

  // ── Vérification de paye (calculVerifPaye) ─────────────────────────────
  function calculVerif(st, y, m) {
    const t = st.tarifs, ag = st.agent;
    let nuits = 0, veSa = 0, saDi = 0, diLu = 0, nTi = 0, nCond = 0, nDp = 0, nRe = 0, nDim = 0;
    for (let d = 1; d <= dim(y, m); d++) {
      const j = getJ(st, ymd(y, m, d)), w = dow(y, m, d);
      if (isNuit(j)) {
        nuits++;
        if (w === 6) veSa++;
        else if (w === 0) saDi++;
        else if (w === 1) diLu++;
      }
      nTi += nbreTi(j);
      if (CONDUITE.includes(j.t)) nCond++;
      if (j.dp) nDp++;
      if (j.re) nRe++;
      if (TRAVAIL_DIM.includes(j.t) && w === 0) nDim++;
    }
    const L = (fia, code, desig, tarif, qte) =>
      ({ fia, code, desig, tarif, qte, total: tarif * qte });
    const lignes = [L('L32', 'TI01', 'Ind. sujétions tx infra (Ti)', t.ti01, nTi)];
    if (ag.classe <= 4) {
      lignes.push(L('LI4', 'CVB01', 'Conduite taux ' + (ag.tauxB ? 'B' : 'A'),
                    ag.tauxB ? t.cvb01b : t.cvb01a, nCond));
    }
    lignes.push(
      L('', 'LQ4_VESA', 'Supp nuit VE/SA', t.lq4, veSa),
      L('', 'LQ4_SADI', 'Supp nuit SA/DI', t.lq4, saDi),
      L('', 'LQ4_DILU', 'Supp nuit DI/LU', t.lq4, diLu),
      L('LE6', 'LE6', 'Milieu de nuit', t.le6, nuits * 4),
      L('', 'LQ0', 'Ind. spéciale nuit', t.lq0, nuits),
      L('L65', 'IS02', 'Ind. spéciale nuit taux 2', t.l65, nuits * 6),
      L('', 'LB6', 'Ind. nuit taux 1', t.lb6, nuits * 3),
      L('KM9', 'KM9', 'Alloc nuit pers. sédentaire', t.km9, nuits),
      L('', 'DIM', 'Dimanche et fêtes travaillés', t.dimFete, nDim),
      L('KLA', 'KLA', 'Allocation repas', t.kla, nRe),
      L('KLC', 'KLC', 'Allocation DP complet', t.klc, nDp)
    );
    if (ag.forfait && ag.classe === 5) lignes.push(L('', 'FORFAIT', 'Forfait jours (mensuel)', t.forfaitJours, 1));
    lignes.push(L('KM5', 'KM5', 'Compt alloc nuit pers. séd.', t.km5, nuits));
    return {
      lignes, nuits, veSa, saDi, diLu,
      totalCalcule: lignes.reduce((a, l) => a + l.total, 0)
    };
  }

  // ── Salaire : brut -> net ──────────────────────────────────────────────
  // Le pourcentage est ce qui est ENLEVÉ : 1000 € brut à 25 % -> 750 € net. À 0 %, on renvoie le brut.
  const brutVersNet = (brut, pct) => pct > 0 ? brut * ((100 - pct) / 100) : brut;

  function infosSalaire(st, y, m) {
    const ov = st.salaires[y + '-' + pad2(m)];
    return {
      s: ov ? ov.s : st.agent.salaire,
      p: ov ? ov.p : st.agent.prime,
      pct: st.agent.pct,                 // toujours celui de l'onglet Agent
      surcharge: !!ov
    };
  }

  // ── Résumé mensuel (onglet Mensuel) ────────────────────────────────────
  function resumeMois(st, y, m) {
    const t = totauxMois(st, y, m), v = calculVerif(st, y, m);
    const HORS_BRUT = ['TI01', 'KLA', 'KLC', 'KM9'];
    const autres = v.lignes.filter(l => !HORS_BRUT.includes(l.code)).reduce((a, l) => a + l.total, 0);
    const brut = t.eTi + autres;
    const km9 = v.lignes.filter(l => l.code === 'KM9').reduce((a, l) => a + l.total, 0);
    const net = km9 + t.alloc;
    const inf = infosSalaire(st, y, m);
    const brutEnNet = brutVersNet(brut, inf.pct);
    const horsSalaire = brutEnNet + net;
    const salNet = brutVersNet(inf.s, inf.pct);
    const primeNet = brutVersNet(inf.p, inf.pct);
    return { t, v, autres, brut, km9, net, inf, brutEnNet, horsSalaire, salNet, primeNet,
             total: salNet + primeNet + horsSalaire };
  }

  // Montants de la fiche de paye pour le mois : saisie de l'onglet Vérif, sinon import CSV de l'APK
  function ficheMois(st, y, m) {
    const key = y + '-' + pad2(m), fv = st.ficheVerif[key];
    if (fv && Object.keys(fv).length) {
      return { ti: fv.TI01 || 0, alloc: (fv.KLA || 0) + (fv.KLC || 0) };
    }
    const f = st.fiches[key];
    return f ? { ti: f[0] || 0, alloc: f[1] || 0 } : { ti: 0, alloc: 0 };
  }

  // ── CSV (format identique à l'APK) ─────────────────────────────────────
  function exportCsv(st, annee) {
    const L = ['Date;Semaine;Type;DP;Repas;Ti;WE_Travaille'];
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= dim(annee, m); d++) {
        const ds = ymd(annee, m, d), j = getJ(st, ds);
        L.push([ds, isoWeek(annee, m, d), j.t, j.dp ? 1 : 0, j.re ? 1 : 0,
                (j.t !== 'T4' && j.ti) ? 1 : 0, nbreWe(j)].join(';'));
      }
    }
    L.push('', '#FICHES_PAYE;Mois;Ti_Fiche;Alloc_Fiche');
    for (let m = 1; m <= 12; m++) {
      const f = ficheMois(st, annee, m);
      if (f.ti || f.alloc) L.push('#FICHES_PAYE;' + annee + '-' + pad2(m) + ';' + f.ti + ';' + f.alloc);
    }
    L.push('', '#TARIFS;Ti;DP;Repas', '#TARIFS;' + st.tarifs.ti01 + ';' + st.tarifs.klc + ';' + st.tarifs.kla);
    L.push('', '#SALAIRE;Mois;Salaire_Brut;Prime_Travail;Pourcentage_Cotisations');
    Object.keys(st.salaires).sort().forEach(k => {
      const s = st.salaires[k];
      L.push('#SALAIRE;' + k + ';' + s.s + ';' + s.p + ';' + st.agent.pct);
    });
    return L.join('\n');
  }

  function importCsv(st, text) {
    const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { ok: false, msg: 'Fichier vide' };
    if (!lines[0].startsWith('Date;')) {
      return { ok: false, msg: 'Format CSV non reconnu (en-tête attendu : Date;Semaine;Type;…)' };
    }
    const KEY = /^\d{4}-\d{2}$/;
    const num = s => { const v = parseFloat(String(s).replace(',', '.')); return isNaN(v) ? 0 : v; };
    let n = 0, annee = 0, pctCsv = 0;
    for (const line of lines.slice(1)) {
      if (!line.startsWith('#')) {
        const c = line.split(';');
        if (c.length < 6) continue;
        const ds = c[0].trim(), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds);
        if (!m) continue;
        const t = TYPES[c[2].trim()] ? c[2].trim() : 'RP';
        setJ(st, ds, { t, dp: c[3] === '1', re: c[4] === '1', ti: WE.includes(t) ? 0 : (c[5] === '1' ? 1 : 0) });
        if (!annee) annee = +m[1];
        n++;
      } else if (line.startsWith('#FICHES_PAYE;')) {
        const c = line.slice(13).split(';');
        if (c.length >= 3 && KEY.test(c[0])) st.fiches[c[0]] = [num(c[1]), num(c[2])];
      } else if (line.startsWith('#TARIFS;')) {
        const c = line.slice(8).split(';');
        if (c.length >= 3 && !isNaN(parseFloat(c[0]))) {
          st.tarifs.ti01 = num(c[0]); st.tarifs.klc = num(c[1]); st.tarifs.kla = num(c[2]);
        }
      } else if (line.startsWith('#SALAIRE;')) {
        const c = line.slice(9).split(';');
        if (c.length >= 4 && KEY.test(c[0])) {
          st.salaires[c[0]] = { s: num(c[1]), p: num(c[2]) };
          if (num(c[3]) > 0) pctCsv = num(c[3]);
        }
      }
    }
    if (!n) return { ok: false, msg: 'Aucune journée valide trouvée' };
    if (st.agent.pct === 0 && pctCsv > 0) st.agent.pct = pctCsv;
    if (annee) st.annee = annee;
    return { ok: true, n, annee, msg: n + ' journées importées pour ' + (annee || '—') };
  }

  const API = { TYPES, WE, DEFAULT_TARIFS, pad2, ymd, dim, dow, isoWeek, normalize, getJ, setJ,
    nbreTi, totauxMois, calculVerif, brutVersNet, infosSalaire, resumeMois, ficheMois,
    exportCsv, importCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.EVSCalc = API;
})(typeof window !== 'undefined' ? window : globalThis);
