/* ============ Analyse : upload captures, appel IA, rendu du plan ============ */
window.AnalyzeMgr = {
  /* ---------- Upload d'images ---------- */
  addFiles(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 5);
    if (imgs.length === 0) return;
    let room = 5 - APP.pendingImages.length;
    if (room <= 0) { toast(t('5 captures maximum — supprimez-en une d’abord.'), 'err'); return; }
    for (const f of imgs.slice(0, room)) {
      const reader = new FileReader();
      reader.onload = () => {
        APP.pendingImages.push({ name: f.name, dataUrl: reader.result });
        AnalyzeMgr.renderThumbs();
      };
      reader.readAsDataURL(f);
    }
    if (imgs.length > room) toast(t('Seules {n} image(s) ajoutée(s) (limite : 5).', { n: room }));
  },

  renderThumbs() {
    const c = $('#thumbs');
    c.innerHTML = APP.pendingImages.map((img, i) => `
      <div class="thumb">
        <img src="${img.dataUrl}" alt="">
        <button class="rm" data-i="${i}" title="${esc(t('Retirer'))}">✕</button>
      </div>`).join('');
  },

  fillAssetList() { /* rempli par AssetsMgr.render() via datalist */ },

  /* ---------- Appel analyse ---------- */
  async run() {
    const btn = $('#btn-analyze');
    if (APP.pendingImages.length === 0) { toast(t('Ajoutez au moins une capture d’écran.'), 'err'); return; }
    if (!APP.settings || !APP.settings.hasKey) {
      toast(t('Configurez d’abord votre clé API dans l’onglet Réglages.'), 'err');
      document.querySelector('[data-tab="settings"]').click();
      return;
    }
    btn.disabled = true;
    btn.textContent = t('⏳ Analyse en cours (peut prendre 1 à 2 min)…');
    try {
      const j = await api('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({
          images: APP.pendingImages.map(i => i.dataUrl),
          asset: $('#an-asset').value.trim() || null,
          timeframe: $('#an-tf').value || null,
          notes: $('#an-notes').value.trim() || '',
          direction: $('#an-direction').value,
          compare: !!($('#an-compare') && $('#an-compare').checked)
        })
      });
      AnalyzeMgr.showResult(j);
      if (j.warning) toast(j.warning, 'err');
      else toast(t('Analyse terminée ✓'), 'ok');
      APP.pendingImages = [];
      AnalyzeMgr.renderThumbs();
      await AnalyzeMgr.refreshHistory();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = t('⚡ Analyser');
    }
  },

  /* ---------- Rendu du résultat ---------- */
  showResult(entry) {
    APP.currentAnalysis = entry;
    if (APP.lastShownId !== entry.id) { APP.viewLang = null; APP.lastShownId = entry.id; }
    $('#result-empty').hidden = true;
    const body = $('#result-body');
    body.hidden = false;

    // Langue du texte de l'IA : les anciennes analyses (sans « lang ») sont en français ; la démo suit l'interface
    const srcLang = !entry.id ? LANG : (entry.lang === 'en' || entry.lang === 'fr') ? entry.lang : 'fr';
    // Langue affichée : choisie avec le sélecteur EN | FR de l'analyse ; sinon celle de l'interface si disponible
    const hasLang = l => l === srcLang || !!(entry.translations && entry.translations[l]);
    const viewLang = (APP.viewLang && hasLang(APP.viewLang)) ? APP.viewLang : (hasLang(LANG) ? LANG : srcLang);
    const r = viewLang === srcLang ? entry.result : entry.translations[viewLang];
    APP.currentView = { ...entry, result: r, viewLang }; // version affichée : utilisée par « Copier le plan », TradingView et Sheets
    let langBar = '';
    if (entry.result && entry.id) {
      const langName = l => l === 'fr' ? t('français') : t('anglais');
      const other = viewLang === 'en' ? 'fr' : 'en';
      const segBtn = l => `<button class="seg-btn ${viewLang === l ? 'active' : ''}" data-view-lang="${l}">${l === 'en' ? 'English' : 'Français'}</button>`;
      const note = viewLang !== srcLang
        ? t('traduction automatique — original en {lang}', { lang: langName(srcLang) })
        : hasLang(other) ? '' : t('Cliquez sur {lang} pour traduire (une seule fois, avec votre IA).', { lang: other === 'en' ? 'English' : 'Français' });
      langBar = `<div class="lang-bar"><span>🌐 ${esc(t('Langue de l’analyse :'))}</span>
        <div class="seg-lang">${segBtn('en')}${segBtn('fr')}</div>
        ${note ? `<span class="muted">${esc(note)}</span>` : ''}</div>`;
    }

    if (!r) {
      body.innerHTML = `
        <div class="warn-box">${esc(t('⚠️ L’IA n’a pas renvoyé de JSON exploitable. Réponse brute :'))}</div>
        <div class="raw-box">${esc(entry.raw || t('(vide)'))}</div>`;
      return;
    }
    const bias = String(r.biais || 'NEUTRE').toUpperCase().includes('ACHAT') ? 'ACHAT'
               : String(r.biais || '').toUpperCase().includes('VENTE') ? 'VENTE' : 'NEUTRE';
    const cls = bias === 'ACHAT' ? 'buy' : bias === 'VENTE' ? 'sell' : 'neutral';
    const tps = (r.takeProfits || []).slice(0, 3);
    const tpCells = tps.map((tp, i) => `
      <div class="level tp">
        <div class="k">TP${i + 1}</div>
        <div class="v">${fmtNum(tp && tp.niveau)}</div>
      </div>`).join('');
    const zone = r.zoneEntree && (r.zoneEntree.min != null || r.zoneEntree.max != null)
      ? `<p class="zone-note">🎯 ${esc(t('Zone d’entrée :'))} <b>${fmtNum(r.zoneEntree.min)} – ${fmtNum(r.zoneEntree.max)}</b></p>` : '';
    const rr = r.ratioRisqueRendement
      ? `<p class="rr-note">⚖️ ${esc(t('Ratio risque/rendement (TP1) :'))} <b>${fmtNum(r.ratioRisqueRendement)}</b></p>` : '';

    // Taille de position suggérée — valeurs serveur (result.taillePosition) si présentes,
    // sinon calcul local avec distance = Math.abs(entree - stopLoss)
    let sizing = '';
    const assetType = (APP.assets.find(a => (r.actif || '').toUpperCase().includes(a.symbol)) || {}).type;
    const fmtSize = (units) => assetType === 'forex'
      ? t('{lots} lot ({units} unités)', { lots: (units / 100000).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), units: units.toLocaleString(LOCALE, { maximumFractionDigits: 0 }) })
      : t('{units} unités', { units: units.toLocaleString(LOCALE, { maximumFractionDigits: 2 }) });
    if (r.taillePosition && r.taillePosition.unites != null) {
      const tp = r.taillePosition;
      sizing = `<p class="size-note">💰 ${esc(t('Taille de position (risque {risk} / distance SL {dist}) :', { risk: fmtNum(tp.risqueMonetaire), dist: fmtNum(tp.distanceStop) }))}
        <b>${fmtSize(tp.unites)}</b></p>`;
    } else {
      const s = APP.settings || {};
      const bal = parseFloat(s.balance), pct = parseFloat(s.riskPercent);
      if (bal > 0 && pct > 0 && Number.isFinite(Number(r.entree)) && Number.isFinite(Number(r.stopLoss)) && r.entree && r.stopLoss) {
        const riskAmt = bal * pct / 100;
        const dist = Math.abs(Number(r.entree) - Number(r.stopLoss));
        if (dist > 0) {
          const units = riskAmt / dist;
          sizing = `<p class="size-note">💰 ${esc(t('Taille suggérée (risque {pct}% = {amt} / distance SL {dist}) :', { pct, amt: riskAmt.toFixed(2), dist: fmtNum(dist) }))}
            <b>${fmtSize(units)}</b></p>`;
        }
      }
    }

    const chips = (r.figuresDetectees || []).map(f => `<span class="chip">${esc(f)}</span>`).join('');
    const indicators = (r.indicateurs || []).length ? `
      <div class="md-sec"><h3>${esc(t('Indicateurs lus sur le chart'))}</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>${esc(t('Indicateur'))}</th><th>${esc(t('Lecture'))}</th><th>${esc(t('Implication'))}</th></tr></thead>
          <tbody>${r.indicateurs.map(i => `
            <tr>
              <td><b>${esc(i.nom)}</b></td><td>${esc(i.lecture)}</td>
              <td>${esc(i.implication)}</td>
            </tr>`).join('')}
          </tbody></table></div></div>` : '';
    const levelsMini = r.niveauxCles && (r.niveauxCles.supports || r.niveauxCles.resistances) ? `
      <div class="levels-mini">
        <span class="supp">${esc(t('Supports :'))} <b>${(r.niveauxCles.supports || []).map(fmtNum).join(' · ') || '—'}</b></span>
        <span class="res">${esc(t('Résistances :'))} <b>${(r.niveauxCles.resistances || []).map(fmtNum).join(' · ') || '—'}</b></span>
      </div>` : '';
    const warns = (r.avertissements || []).length ? `
      <div class="warn-box">⚠️ ${esc(t('Avertissements'))}<ul>${r.avertissements.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
    const evProches = (r.evenementsProches || []).length ? `
      <div class="chips-line">${r.evenementsProches.map(e => `<span class="chip imp">📅 ${esc(e)}</span>`).join('')}</div>` : '';

    // Comparaison multi-IA + consensus
    let comparisonHtml = '';
    const comps = entry.comparisons || [];
    const consensus = entry.consensus;
    if (comps.length || consensus) {
      const cell = (c) => {
        if (!c || c.error) return `<div class="bt-cell"><div class="k">❌ ${esc((c && c.name) || 'IA')}</div><div class="v" style="font-size:12px;color:var(--red)">${esc((c && c.error) || t('échec'))}</div></div>`;
        const q = c.result || {};
        const b = String(q.biais || '').toUpperCase();
        const bCls = b.includes('ACHAT') ? 'pos' : b.includes('VENTE') ? 'neg' : '';
        return `<div class="bt-cell">
          <div class="k">${esc(c.name)} <span class="muted" style="text-transform:none">(${esc(c.model || '')})</span></div>
          <div class="v ${bCls}">${b.includes('ACHAT') ? '▲ ' + t('ACHAT') : b.includes('VENTE') ? '▼ ' + t('VENTE') : '● ' + t('NEUTRE')}${Number.isFinite(Number(q.confiance)) && q.confiance !== null ? ' · ' + Number(q.confiance) + '%' : ''}</div>
          <div class="muted" style="font-size:11.5px">${esc(t('E :'))} ${fmtNum(q.entree)} · SL : ${fmtNum(q.stopLoss)} · TP1 : ${q.takeProfits && q.takeProfits[0] ? fmtNum(q.takeProfits[0].niveau) : '—'} · R:R : ${fmtNum(q.ratioRisqueRendement)}</div>
        </div>`;
      };
      const consensusHtml = consensus ? `
        <div class="bt-verdict ${consensus.biais === 'DÉSACCORD' ? 'stop-lim' : consensus.biais === 'ACHAT' ? 'warn-lim' : 'warn-lim'}" style="margin:10px 0">
          ${consensus.biais === 'DÉSACCORD'
            ? esc(t('⚖️ DÉSACCORD entre les IA ({a} achat / {v} vente / {n} neutre)', { a: consensus.votes.ACHAT, v: consensus.votes.VENTE, n: consensus.votes.NEUTRE }))
            : esc(t('🤝 CONSENSUS {bias} ({count} IA — votes : {a} achat / {v} vente / {n} neutre)', { bias: biasLabel(consensus.biais), count: consensus.n, a: consensus.votes.ACHAT, v: consensus.votes.VENTE, n: consensus.votes.NEUTRE }))}
          ${consensus.confianceMoyenne != null ? ' · ' + esc(t('confiance moyenne {v}%', { v: consensus.confianceMoyenne })) : ''}
          ${consensus.entreeMediane != null ? ' · ' + esc(t('entrée médiane {v}', { v: fmtNum(consensus.entreeMediane) })) : ''}
          ${consensus.stopLossMedian != null ? ' · ' + esc(t('SL médian {v}', { v: fmtNum(consensus.stopLossMedian) })) : ''}
          ${consensus.tp1Median != null ? ' · ' + esc(t('TP1 médian {v}', { v: fmtNum(consensus.tp1Median) })) : ''}
          ${consensus.rrMoyen != null ? ' · ' + esc(t('R:R moyen {v}', { v: fmtNum(consensus.rrMoyen) })) : ''}
        </div>` : '';
      comparisonHtml = `
        <div class="md-sec"><h3>⚖️ ${esc(t('Comparaison des IA'))}</h3>
          ${consensusHtml}
          <div class="bt-modal-grid">${comps.map(cell).join('')}</div>
        </div>`;
    }
    const dateTxt = entry.date ? new Date(entry.date).toLocaleString(LOCALE) : '';
    const imgsTxt = (entry.images || []).length ? `<span class="muted" style="margin-left:auto">${esc(t('{n} capture(s)', { n: entry.images.length }))} · ${esc(entry.model || '')} · ${dateTxt}</span>` : '';

    body.innerHTML = `
      ${langBar}
      ${entry.truncated ? `<div class="warn-box">✂️ ${esc(t('Réponse de l’IA tronquée par la limite de longueur : les niveaux sont fiables, le texte d’analyse peut être incomplet. Relancez pour obtenir l’analyse complète.'))}</div>` : ''}
      ${(entry.macroEvents || []).some(ev => ev.minutesUntil <= 180) ? (entry.macroEvents || []).filter(ev => ev.minutesUntil <= 180).map(ev =>
        `<div class="mb-item red" style="margin-bottom:8px">⛔ ${esc(t('FENÊTRE À ÉVITER'))} — ${esc(ev.title)} (${esc(ev.country)}) ${esc(ev.minutesUntil >= 60 ? t('dans {h} h {m}', { h: Math.floor(ev.minutesUntil / 60), m: String(ev.minutesUntil % 60).padStart(2, '0') }) : t('dans {m} min', { m: ev.minutesUntil }))}</div>`
      ).join('') : ''}
      <div class="signal-head">
        <span class="badge ${cls}">${bias === 'ACHAT' ? '▲ ' + t('ACHAT') : bias === 'VENTE' ? '▼ ' + t('VENTE') : '● ' + t('NEUTRE')}</span>
        <div class="confidence">
          <div class="pct">${Number(r.confiance) || 0}%</div>
          <div class="lbl">${esc(t('CONFIANCE'))}</div>
        </div>
        <div class="sig-meta">
          <b>${esc(r.actif || entry.params?.asset || '—')}</b>
          ${r.uniteDeTemps ? `· ${esc(r.uniteDeTemps)}` : ''}
          ${r.prixActuel != null ? `· ${esc(t('prix ≈'))} <b>${fmtNum(r.prixActuel)}</b>` : ''}
        </div>
        ${imgsTxt}
      </div>

      <div class="levels-grid">
        <div class="level entry"><div class="k">${esc(t('Entrée'))}</div><div class="v">${fmtNum(r.entree)}</div></div>
        <div class="level sl"><div class="k">Stop Loss</div><div class="v">${fmtNum(r.stopLoss)}</div></div>
        ${tpCells || '<div class="level tp"><div class="k">TP</div><div class="v">—</div></div>'}
      </div>
      ${zone}${rr}${sizing}
      ${chips ? `<div class="chips-line">${chips}</div>` : ''}
      ${evProches}
      ${levelsMini}
      ${indicators}
      <div class="md-sec"><h3>📐 ${esc(t('Analyse technique'))}</h3><div class="md">${mdToHtml(r.analyseTechnique || '')}</div></div>
      <div class="md-sec"><h3>🌍 ${esc(t('Analyse fondamentale'))}</h3><div class="md">${mdToHtml(r.analyseFondamentale || '')}</div></div>
      ${r.invalidation ? `<div class="md-sec"><h3>🚫 ${esc(t('Invalidation du scénario'))}</h3><div class="md">${mdToHtml(r.invalidation)}</div></div>` : ''}
      ${r.gestion ? `<div class="md-sec"><h3>🎛️ ${esc(t('Gestion de position'))}</h3><div class="md">${mdToHtml(r.gestion)}</div></div>` : ''}
      ${warns}
      ${comparisonHtml}
      <div class="btn-row" style="margin-top:14px">${entry.id ? `<button class="btn" id="btn-journal">📓 ${esc(t('Journaliser ce plan'))}</button><button class="btn" id="btn-notrade">🚫 ${esc(t('Non tradé'))}</button>` : ''}<button class="btn" id="btn-copyplan">📋 ${esc(t('Copier le plan'))}</button>${entry.id ? `<button class="btn" id="btn-sheets" title="${esc(t('Ajouter cette analyse à votre feuille Google Sheets'))}">📊 ${esc(entry.sheetsSavedAt ? t('Enregistré dans Sheets ✓') : t('Enregistrer dans Sheets'))}</button>` : ''}<button class="btn" id="btn-pine" title="${esc(t('Script Pine qui trace l’entrée, le SL et les TP sur votre graphique TradingView'))}">📈 ${esc(t('Vers TradingView'))}</button></div>
      ${entry.id && entry.result ? AnalyzeMgr.feedbackHtml(entry) : ''}
    `;
  },

  /* ---------- Votre avis sur l'analyse (retour utilisateur) ---------- */
  feedbackHtml(entry) {
    const fb = entry.feedback || {};
    const opt = (field, value, label) =>
      `<button type="button" class="seg-btn ${fb[field] === value ? 'active' : ''}" data-fb-field="${field}" data-fb-value="${value}">${esc(label)}</button>`;
    const row = (label, field, opts) =>
      `<div class="fb-row"><span class="fb-label">${esc(label)}</span><div class="seg-lang">${opts.map(([v, l]) => opt(field, v, l)).join('')}</div></div>`;
    const usedParts = [];
    if (entry.profileUsed) usedParts.push(t('votre profil ({n} consigne(s))', { n: entry.profileUsed }));
    if (entry.feedbackUsed) usedParts.push(t('{n} retour(s) précédent(s)', { n: entry.feedbackUsed }));
    const used = usedParts.length ? `<p class="muted fb-used">🧠 ${esc(t('Cette analyse a tenu compte de : {list}.', { list: usedParts.join(' + ') }))}</p>` : '';
    return `
      <div class="fb-card" id="fb-card">
        <h3>📝 ${esc(t('Votre avis sur cette analyse'))}</h3>
        <p class="muted">${esc(t('Vos retours sont résumés pour l’IA dans les prochaines analyses, afin de les améliorer.'))}</p>
        ${used}
        ${row(t('Analyse'), 'rating', [['good', '👍 ' + t('Bonne')], ['bad', '👎 ' + t('Mauvaise')]])}
        ${row(t('Entrée'), 'entry', [['good', '✓ ' + t('Bonne')], ['early', t('Trop tôt')], ['late', t('Trop tard')]])}
        ${row('Stop loss', 'sl', [['good', '✓ ' + t('Bon')], ['tight', t('Trop serré')], ['wide', t('Trop large')]])}
        ${row('Take profits', 'tp', [['good', '✓ ' + t('Bons')], ['far', t('Trop loin')], ['close', t('Trop proches')]])}
        ${row(t('Résultat'), 'outcome', [['tp', '🎯 ' + t('TP touché')], ['sl', '🛑 ' + t('SL touché')], ['be', '➖ Break-even'], ['none', '⏸ ' + t('Non déclenché')]])}
        <textarea id="fb-comment" rows="2" maxlength="500" placeholder="${esc(t('Commentaire (facultatif) — ex. : SL touché par une mèche juste avant la hausse'))}">${esc(fb.comment || '')}</textarea>
        <div class="fb-foot">
          <button type="button" class="btn btn-sm" id="fb-save">💾 ${esc(t('Enregistrer le commentaire'))}</button>
          <span class="muted">${fb.at ? esc(t('Retour enregistré le {date}', { date: new Date(fb.at).toLocaleString(LOCALE) })) : ''}</span>
        </div>
      </div>`;
  },

  async saveFeedback(patch) {
    const entry = APP.currentAnalysis;
    if (!entry || !entry.id) return;
    const body = { ...(entry.feedback || {}), comment: ($('#fb-comment') && $('#fb-comment').value) || '', ...patch };
    try {
      const updated = await api(`/api/analyses/${encodeURIComponent(entry.id)}/feedback`, { method: 'PUT', body: JSON.stringify(body) });
      if (APP.currentAnalysis && APP.currentAnalysis.id === entry.id) {
        const y = window.scrollY;
        AnalyzeMgr.showResult(updated);
        window.scrollTo(0, y);
      }
      AnalyzeMgr.refreshHistory();
      return true;
    } catch (err) { toast(err.message, 'err'); return false; }
  },

  /* ---------- Historique ---------- */
  async refreshHistory() {
    try {
      APP.analyses = await api('/api/analyses');
    } catch { return; }
    const list = $('#history-list');
    const good = APP.analyses.filter(a => a.feedback && a.feedback.rating === 'good').length;
    const bad = APP.analyses.filter(a => a.feedback && a.feedback.rating === 'bad').length;
    $('#history-count').textContent = APP.analyses.length
      ? t('{n} analyse(s)', { n: APP.analyses.length }) + (good + bad ? ` · 👍 ${good} · 👎 ${bad}` : '') : '';
    if (!APP.analyses.length) {
      list.innerHTML = `<p class="muted">${esc(t('Aucune analyse enregistrée.'))}</p>`;
      return;
    }
    list.innerHTML = APP.analyses.map(a => {
      const bias = a.result ? String(a.result.biais || 'NEUTRE').toUpperCase() : null;
      const biasCls = bias && bias.includes('ACHAT') ? 'ACHAT' : bias && bias.includes('VENTE') ? 'VENTE' : 'NEUTRE';
      const thumb = (a.images && a.images[0]) ? `<img src="/uploads/${encodeURIComponent(a.images[0])}" alt="">` : '<div class="thumb"></div>';
      return `
        <div class="hist-item" data-id="${esc(a.id)}">
          ${thumb}
          <div class="hist-main">
            <div class="hist-sym">${a.params?.source === 'tradingview' ? `<span class="tv-tag" title="${esc(t('Analyse lancée par une alerte TradingView'))}">📡</span> ` : ''}${esc((a.result && a.result.actif) || a.params?.asset || '—')}
              ${a.params?.timeframe ? `<span class="muted">· ${esc(a.params.timeframe)}</span>` : ''}</div>
            <div class="hist-date">${new Date(a.date).toLocaleString(LOCALE)}</div>
          </div>
          ${a.feedback && a.feedback.rating ? `<span class="fb-mark" title="${esc(a.feedback.rating === 'good' ? t('Jugée bonne') : t('Jugée mauvaise'))}">${a.feedback.rating === 'good' ? '👍' : '👎'}</span>` : ''}
          <span class="hist-bias ${biasCls}">${a.result ? esc(biasLabel(biasCls)) : esc(t('ÉCHEC'))}</span>
          <button class="hist-del" data-jour="${esc(a.id)}" title="${esc(t('Journaliser ce plan'))}">📓</button>
          <button class="hist-del" data-del="${esc(a.id)}" title="${esc(t('Supprimer'))}">🗑️</button>
        </div>`;
    }).join('');
  }
};

/* ---------- Écouteurs ---------- */
const dz = $('#dropzone');
dz.addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => { AnalyzeMgr.addFiles(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', e => AnalyzeMgr.addFiles(e.dataTransfer.files));
$('#thumbs').addEventListener('click', e => {
  const i = e.target.getAttribute('data-i');
  if (i !== null && i !== undefined) {
    APP.pendingImages.splice(+i, 1);
    AnalyzeMgr.renderThumbs();
  }
});
// coller une image depuis le presse-papiers (touche PrintScreen)
document.addEventListener('paste', e => {
  const files = Array.from(e.clipboardData?.files || []);
  if (files.length && document.querySelector('#tab-analyze.active')) AnalyzeMgr.addFiles(files);
});

$('#btn-analyze').addEventListener('click', () => AnalyzeMgr.run());

$('#history-list').addEventListener('click', async e => {
  const del = e.target.getAttribute('data-del');
  const jour = e.target.getAttribute('data-jour');
  if (jour) {
    e.stopPropagation();
    await journalizeAnalysis(jour);
    return;
  }
  if (del) {
    e.stopPropagation();
    if (!confirm(t('Supprimer cette analyse ?'))) return;
    try {
      await api(`/api/analyses/${del}`, { method: 'DELETE' });
      await AnalyzeMgr.refreshHistory();
    } catch (err) { toast(err.message, 'err'); }
    return;
  }
  const item = e.target.closest('.hist-item');
  if (item) {
    try {
      const full = await api(`/api/analyses/${item.dataset.id}`);
      AnalyzeMgr.showResult(full);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { toast(err.message, 'err'); }
  }
});

/* ---------- Démo ---------- */
const DEMO_RESULT_EN = {
  actif: 'XAUUSD', uniteDeTemps: 'H4', biais: 'ACHAT', confiance: 72, prixActuel: 2738.5,
  entree: 2732, zoneEntree: { min: 2728, max: 2736 }, stopLoss: 2712,
  takeProfits: [
    { niveau: 2755, commentaire: 'Intraday resistance + 1.2R extension' },
    { niveau: 2778, commentaire: 'Previous high' },
    { niveau: 2805, commentaire: '1.618 Fibonacci extension target' }
  ],
  ratioRisqueRendement: 1.15,
  figuresDetectees: ['Falling wedge breakout', 'Bullish pin bar on support', 'Bullish MACD divergence'],
  indicateurs: [
    { nom: 'RSI(14)', lecture: 'Leaving oversold territory (38 → 47)', implication: 'bullish' },
    { nom: 'EMA 200', lecture: 'Price above, rising slope', implication: 'bullish' },
    { nom: 'Volume', lecture: 'Expanding on the breakout', implication: 'bullish' }
  ],
  niveauxCles: { supports: [2712, 2688], resistances: [2755, 2778] },
  analyseTechnique: '**Trend**: bullish on H4 and D1 (higher highs and higher lows).\n\nPrice broke the upper bound of a **falling wedge** after a divergence, then made a successful **retest** of the 2728-2736 zone (former resistance turned support).\n\n- Bullish pin bar on horizontal support\n- EMA 200 pointing up, price above it\n- Volume expanding on the breakout\n\nPreferred scenario: **bullish continuation** towards 2755 then 2778 as long as 2712 holds.',
  analyseFondamentale: 'Macro context: wait-and-see ahead of the **US CPI** release and Fed speakers, a backdrop that has historically favoured gold with real yields trending lower.\n\nRecent news (FinancialJuice) shows mixed headlines on the dollar, which supports the scenario. **Caution**: a hot inflation surprise could trigger a sharp reversal before price gets above 2760.',
  invalidation: 'An H4 close below 2712 invalidates the bullish structure — exit immediately, potential reversal towards 2688.',
  gestion: 'Take 50% of the position at TP1 (2755), move the stop to break-even, then trail it under H4 swing lows to target TP3.',
  avertissements: ['Demo example — levels are fictitious and for illustration only.', 'Always check levels on your trading platform before placing any order.']
};

$('#btn-demo').addEventListener('click', () => {
  AnalyzeMgr.showResult({
    date: new Date().toISOString(),
    model: t('démo'),
    images: [],
    params: { asset: 'XAUUSD', timeframe: 'H4' },
    result: LANG === 'en' ? DEMO_RESULT_EN : {
      actif: 'XAUUSD', uniteDeTemps: 'H4', biais: 'ACHAT', confiance: 72, prixActuel: 2738.5,
      entree: 2732, zoneEntree: { min: 2728, max: 2736 }, stopLoss: 2712,
      takeProfits: [
        { niveau: 2755, commentaire: 'Résistance intraday + extension 1,2R' },
        { niveau: 2778, commentaire: 'Sommet précédent' },
        { niveau: 2805, commentaire: 'Objectif extension Fibonacci 1,618' }
      ],
      ratioRisqueRendement: 1.15,
      figuresDetectees: ['Biseau descendant cassé', 'Pin bar haussière sur support', 'Divergence MACD haussière'],
      indicateurs: [
        { nom: 'RSI(14)', lecture: 'Sortie de zone de survente (38 → 47)', implication: 'haussière' },
        { nom: 'EMA 200', lecture: 'Prix au-dessus, pente positive', implication: 'haussière' },
        { nom: 'Volume', lecture: 'Expansion sur la cassure', implication: 'haussière' }
      ],
      niveauxCles: { supports: [2712, 2688], resistances: [2755, 2778] },
      analyseTechnique: '**Tendance** : haussière sur H4 et D1 (structure en sommets/creux ascendants).\n\nLe prix a cassé la borne haute d’un **biseau descendant** après une divergence, puis réalisé un **retest** réussi de la zone 2728-2736 (ancienne résistance devenue support).\n\n- Pin bar haussière sur le support horizontal\n- EMA 200 orientée à la hausse, prix au-dessus\n- Volume en expansion à la cassure\n\nScénario privilégié : **continuation haussière** vers 2755 puis 2778 tant que 2712 tient.',
      analyseFondamentale: 'Contexte macro : attentisme avant la publication du **CPI américain** et les déclarations de la Fed, environnement traditionnellement favorable à l’or avec des taux réels orientés à la baisse.\n\nLes news récentes (FinancialJuice) montrent un flux d’actualité mitigé sur le dollar, ce qui soutient le scénario. **Attention** : une statistique d’inflation surprise (chaude) pourrait provoquer un retour brutal au-dessus de 2760.',
      invalidation: 'Clôture H4 sous 2712 invalide la structure haussière — sortie immédiate, retournement potentiel vers 2688.',
      gestion: 'Prendre 50% de la position à TP1 (2755), placer le stop en break-even, puis suivre avec un stop suiveur sous les creux H4 pour viser TP3.',
      avertissements: ['Exemple de démonstration — niveaux fictifs à but illustratif.', 'Vérifiez toujours les niveaux sur votre plateforme avant tout ordre.']
    }
  });
});

AnalyzeMgr.refreshHistory();

/* ---------- Journalisation d'un plan d'analyse (avec checklist pré-trade) ---------- */
async function journalizeAnalysis(analysisId) {
  try {
    // état pour la checklist
    let limits = null, macro = [];
    try { limits = await api('/api/trading-limits'); } catch { /* non bloquant */ }
    try { macro = await api('/api/macro-events'); } catch { /* non bloquant */ }

    const autoNoNews = !macro.length || macro.every(e => e.minutesUntil > 180);
    const autoSize = !!(APP.settings && Number(APP.settings.balance) > 0 && Number(APP.settings.riskPercent) > 0);
    const autoNoRevenge = !limits || limits.consecutiveLosses < limits.limits.maxLossesConsecutive;

    const items = [
      { id: 'ck-sl', label: t('Mon SL est défini et placé <b>AVANT</b> d’entrer'), checked: false, hint: esc(t('À cocher manuellement')) },
      { id: 'ck-rr', label: esc(t('Mon R:R est ≥ 1 (ou justification si < 1)')), checked: false, hint: esc(t('À cocher manuellement — vérifiez le R:R affiché sur le plan')) },
      { id: 'ck-news', label: esc(t('Aucune news à fort impact dans les 3 h')), checked: autoNoNews, hint: esc(autoNoNews ? t('Auto-coché : aucun événement High < 3 h') : t('⚠️ Événement High imminent — voyez le bandeau rouge')) },
      { id: 'ck-size', label: esc(t('Ma taille de position respecte mon risque max')), checked: autoSize, hint: esc(autoSize ? t('Auto-coché : calcul serveur OK (solde {bal}, risque {pct}%)', { bal: APP.settings.balance, pct: APP.settings.riskPercent }) : t('Solde/risque non configurés dans Réglages')) },
      { id: 'ck-revenge', label: esc(t('Je ne suis pas en revenge trading')), checked: autoNoRevenge, hint: esc(autoNoRevenge ? t('Auto-coché : moins de {n} pertes consécutives', { n: limits ? limits.limits.maxLossesConsecutive : 2 }) : t('⚠️ {n} pertes consécutives — pause recommandée', { n: limits.consecutiveLosses })) }
    ];

    const overlay = $('#modal-overlay'), box = $('#modal-box');
    box.innerHTML = `
      <h3>✅ ${esc(t('Checklist pré-trade'))}</h3>
      <div class="modal-sub">${esc(t('Validation obligatoire avant de journaliser ce plan. Les règles non respectées bloquent la validation.'))}</div>
      ${items.map(it => `
        <label class="checklist-item">
          <input type="checkbox" data-ck="${it.id}" ${it.checked ? 'checked' : ''}>
          <span>${it.label}<span class="hint">${it.hint}</span></span>
        </label>`).join('')}
      <div class="checklist-error" id="ck-error"></div>
      <div class="btn-row">
        <button class="btn btn-ghost" id="ck-cancel">${esc(t('Annuler'))}</button>
        <button class="btn btn-primary" id="ck-validate">${esc(t('Valider et journaliser'))}</button>
      </div>`;
    overlay.hidden = false;

    const update = () => {
      const all = box.querySelectorAll('input[data-ck]');
      const ok = [...all].every(i => i.checked);
      $('#ck-validate').disabled = !ok;
      $('#ck-error').textContent = ok ? '' : t('🛑 Règle de discipline non respectée — toutes les cases doivent être cochées.');
    };
    box.querySelectorAll('input[data-ck]').forEach(i => i.addEventListener('change', update));
    update();

    const close = () => { overlay.hidden = true; box.innerHTML = ''; };
    $('#ck-cancel').addEventListener('click', close);

    $('#ck-validate').addEventListener('click', async () => {
      close();
      try {
        const t = await api('/api/trades', { method: 'POST', body: JSON.stringify({ analysisId }) });
        await api(`/api/trades/${t.id}`, { method: 'PUT', body: JSON.stringify({ checklistValidated: true }) });
        toast(t('Plan journalisé avec checklist validée ✓ (onglet 📓)'), 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });
  } catch (err) { toast(err.message, 'err'); }
}
window.journalizeAnalysis = journalizeAnalysis;

$('#result-body').addEventListener('click', async e => {
  if (e.target.closest('#btn-journal')) {
    const id = APP.currentAnalysis && APP.currentAnalysis.id;
    if (!id) return;
    await journalizeAnalysis(id);
  }
  if (e.target.closest('#btn-notrade')) {
    const id = APP.currentAnalysis && APP.currentAnalysis.id;
    if (!id) return;
    const choix = prompt(t('Raison du non-trade ?\n1 = fenêtre macro\n2 = pas de fill\n3 = changement de plan\n4 = autre'), '1');
    const raisons = { 1: 'fenêtre macro', 2: 'pas de fill', 3: 'changement de plan', 4: 'autre' };
    const raison = raisons[choix] || 'autre';
    try {
      const t = await api('/api/trades', { method: 'POST', body: JSON.stringify({ analysisId: id }) });
      await api(`/api/trades/${t.id}`, { method: 'PUT', body: JSON.stringify({ statut: 'annulé', raisonNonTrade: raison }) });
      toast(t('Trade marqué non tradé ({reason}) ✓', { reason: t(raison) }), 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }
  if (e.target.closest('#btn-pine')) {
    TradingViewMgr.showPine(APP.currentView || APP.currentAnalysis);
  }
  if (e.target.closest('#btn-copyplan')) {
    await copyPlanMarkdown(APP.currentView || APP.currentAnalysis);
  }
  const fbBtn = e.target.closest('[data-fb-field]');
  if (fbBtn) {
    const field = fbBtn.dataset.fbField, value = fbBtn.dataset.fbValue;
    const cur = APP.currentAnalysis && APP.currentAnalysis.feedback && APP.currentAnalysis.feedback[field];
    // un second clic sur le choix actif l'annule
    await AnalyzeMgr.saveFeedback({ [field]: cur === value ? null : value }); // la carte affiche « Retour enregistré le … »
    return;
  }
  if (e.target.closest('#fb-save')) {
    if (await AnalyzeMgr.saveFeedback({})) toast(t('Commentaire enregistré ✓'), 'ok');
    return;
  }
  const langBtn = e.target.closest('[data-view-lang]');
  if (langBtn && !langBtn.classList.contains('active')) {
    const entry = APP.currentAnalysis, target = langBtn.dataset.viewLang;
    if (!entry || !entry.id) return;
    const srcLang = (entry.lang === 'en' || entry.lang === 'fr') ? entry.lang : 'fr';
    if (target === srcLang || (entry.translations && entry.translations[target])) {
      APP.viewLang = target;
      AnalyzeMgr.showResult(entry);
      return;
    }
    // pas encore traduite : une seule traduction par l'IA, ensuite enregistrée
    $$('[data-view-lang]').forEach(b => { b.disabled = true; });
    langBtn.textContent = t('⏳ Traduction…');
    try {
      const updated = await api(`/api/analyses/${encodeURIComponent(entry.id)}/translate`, { method: 'POST', body: JSON.stringify({ lang: target }) });
      if (APP.currentAnalysis && APP.currentAnalysis.id === entry.id) {
        APP.viewLang = target;
        AnalyzeMgr.showResult(updated);
      }
      toast(t('Analyse traduite ✓'), 'ok');
    } catch (err) {
      toast(err.message, 'err');
      AnalyzeMgr.showResult(entry);
    }
  }
  if (e.target.closest('#btn-sheets')) {
    await SheetsMgr.saveCurrent();
  }
});

/* ---------- Copie du plan en Markdown ---------- */
async function copyPlanMarkdown(entry) {
  const r = entry && entry.result;
  if (!r) { toast(t('Aucun plan à copier.'), 'err'); return; }
  const n = v => v == null ? '—' : (LANG === 'fr' ? String(v).replace('.', ',') : String(v));
  const bias = String(r.biais || 'NEUTRE').toUpperCase();
  const L = [];
  L.push(`# ${t('Plan de trade')} — ${r.actif || entry.params?.asset || '—'} ${r.uniteDeTemps ? '(' + r.uniteDeTemps + ')' : ''}`);
  L.push('');
  L.push(`- **${t('Biais')}** : ${bias.includes('ACHAT') ? '▲ ' + t('ACHAT') : bias.includes('VENTE') ? '▼ ' + t('VENTE') : '● ' + t('NEUTRE')} — ${t('confiance')} ${r.confiance != null ? r.confiance + ' %' : '—'}`);
  L.push(`- **${t('Entrée')}** : ${n(r.entree)}${r.zoneEntree && (r.zoneEntree.min != null || r.zoneEntree.max != null) ? ` (${t('zone')} ${n(r.zoneEntree.min)} – ${n(r.zoneEntree.max)})` : ''}`);
  L.push(`- **Stop Loss** : ${n(r.stopLoss)}`);
  (r.takeProfits || []).forEach((tp, i) => L.push(`- **TP${i + 1}** : ${n(tp && tp.niveau)}${tp && tp.commentaire ? ' — ' + tp.commentaire : ''}`));
  L.push(`- **R:R (TP1)** : ${n(r.ratioRisqueRendement)}`);
  if (Array.isArray(entry.ratiosParTP) && entry.ratiosParTP.length) {
    L.push(`- **${t('R:R par TP')}** : ${entry.ratiosParTP.map(x => `TP${x.tp} = ${x.rr}R`).join(' · ')}`);
  }
  if (r.taillePosition) {
    const tp = r.taillePosition;
    L.push(`- **${t('Taille de position')}** : ${t('risque')} ${n(tp.risqueMonetaire)} / ${t('distance SL')} ${n(tp.distanceStop)} → ${t('{units} unités', { units: n(tp.unites) })}`);
  }
  if (r.niveauxCles) {
    if ((r.niveauxCles.supports || []).length) L.push(`- **${t('Supports')}** : ${r.niveauxCles.supports.map(n).join(' · ')}`);
    if ((r.niveauxCles.resistances || []).length) L.push(`- **${t('Résistances')}** : ${r.niveauxCles.resistances.map(n).join(' · ')}`);
  }
  if (r.invalidation) { L.push(''); L.push(`## 🚫 ${t('Invalidation')}`); L.push(r.invalidation); }
  if (r.gestion) { L.push(''); L.push(`## 🎛️ ${t('Gestion')}`); L.push(r.gestion); }
  if ((r.avertissements || []).length) { L.push(''); L.push(`## ⚠️ ${t('Avertissements')}`); r.avertissements.forEach(a => L.push(`- ${a}`)); }
  if ((r.evenementsProches || []).length) { L.push(''); L.push(`## 📅 ${t('Événements macro proches')}`); r.evenementsProches.forEach(e2 => L.push(`- ${e2}`)); }
  const md = L.join('\n');
  try {
    await navigator.clipboard.writeText(md);
    toast(t('Plan copié ✓'), 'ok');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = md; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    toast(t('Plan copié ✓'), 'ok');
  }
}
window.copyPlanMarkdown = copyPlanMarkdown;

/* ---------- Bandeau macro : événements High dans les 24 h ---------- */
const MacroBanner = {
  timer: null,
  start() {
    this.refresh();
    if (!this.timer) this.timer = setInterval(() => this.refresh(), 60000);
  },
  async refresh() {
    const box = $('#macro-banner');
    if (!box) return;
    try {
      const symbol = ($('#an-asset') && $('#an-asset').value.trim()) || '';
      const high = await api('/api/macro-events' + (symbol ? '?symbol=' + encodeURIComponent(symbol) : ''));
      if (!high.length) { box.hidden = true; return; }
      const blackout = (APP.settings && Number(APP.settings.blackoutMinutes)) || 60;
      box.hidden = false;
      box.innerHTML = '<b>📅 ' + esc(t('Événements à fort impact dans les 24 h')) + (symbol ? ` (${esc(symbol)})` : '') + ' :</b>' + high.map(ev => {
        const mins = ev.minutesUntil;
        const cls = mins <= blackout ? 'red' : mins <= 180 ? 'orange' : '';
        const inTxt = mins >= 60
          ? t('dans {h} h {m}', { h: Math.floor(mins / 60), m: String(mins % 60).padStart(2, '0') })
          : t('dans {m} min', { m: mins });
        // Windows n'affiche pas les emojis drapeaux (ils rendent en lettres) :
        // on privilégie le code devise, toujours lisible
        return `<span class="mb-item ${cls}"><b>${esc(ev.country)}</b> — ${esc(ev.title)} · ${esc(inTxt)}${cls === 'red' ? ' ⛔ ' + esc(t('FENÊTRE À ÉVITER')) : ''}</span>`;
      }).join('');
    } catch { box.hidden = true; }
  }
};
/* ---------- Bandeau limites de discipline (sur-trading) ---------- */
const LimitsBanner = {
  timer: null,
  start() {
    this.refresh();
    if (!this.timer) this.timer = setInterval(() => this.refresh(), 60000);
  },
  async refresh() {
    const box = $('#limits-banner');
    if (!box) return;
    try {
      const l = await api('/api/trading-limits');
      const rows = [];
      const dLim = l.limits.maxTradesPerDay, wLim = l.limits.maxTradesPerWeek, lossLim = l.limits.maxLossesConsecutive;
      if (l.consecutiveLosses >= lossLim) {
        rows.push(`<div class="blink-lim">🚨 ${esc(t('{n} pertes consécutives — pause de 2 h recommandée', { n: l.consecutiveLosses }))}</div>`);
      }
      if (l.tradesToday >= dLim) {
        rows.push(`<div class="stop-lim">🛑 ${esc(t('Limite journalière atteinte ({n}/{max} trades)', { n: l.tradesToday, max: dLim }))}</div>`);
      } else if (l.tradesToday >= dLim - 1) {
        rows.push(`<div class="warn-lim">⚠️ ${esc(t('{n}/{max} trades aujourd’hui', { n: l.tradesToday, max: dLim }))}</div>`);
      }
      if (l.tradesThisWeek >= wLim) {
        rows.push(`<div class="stop-lim">🛑 ${esc(t('Limite hebdomadaire atteinte ({n}/{max} trades)', { n: l.tradesThisWeek, max: wLim }))}</div>`);
      } else if (l.tradesThisWeek >= wLim - 2) {
        rows.push(`<div class="warn-lim">⚠️ ${esc(t('{n}/{max} trades cette semaine', { n: l.tradesThisWeek, max: wLim }))}</div>`);
      }
      if (rows.length) { box.innerHTML = rows.join(''); box.hidden = false; }
      else box.hidden = true;
    } catch { box.hidden = true; }
  }
};
MacroBanner.start();
LimitsBanner.start();
