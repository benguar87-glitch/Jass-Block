// Globale Variablen
let roundsTeam1 = [];
let roundsTeam2 = [];
let roundsMeta = [];
let chart;
let moodChart;
let games = [];
let currentGameId = null;
let gameFinished = false;
let preparingNewGame = false;
let savedSettings = null;
const themeStorageKey = 'studiJassTheme';
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
let manualThemePreference = null;

function updateThemeToggleButton(currentTheme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const nextMode = currentTheme === 'dark' ? 'light' : 'dark';
  btn.textContent = nextMode === 'dark' ? '🌙' : '☀️';
  btn.setAttribute('aria-label', `In den ${nextMode === 'dark' ? 'Dunkelmodus' : 'Hellmodus'} wechseln`);
}

function applyTheme(theme, persistPreference) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', normalized);
  updateThemeToggleButton(normalized);
  if (persistPreference) {
    manualThemePreference = normalized;
    localStorage.setItem(themeStorageKey, normalized);
  } else {
    manualThemePreference = null;
    localStorage.removeItem(themeStorageKey);
  }
  updateThemeResetVisibility();
}

function updateThemeResetVisibility() {
  const resetBtn = document.getElementById('themeResetBtn');
  if (!resetBtn) return;
  resetBtn.style.display = manualThemePreference ? 'inline-flex' : 'none';
}

function resetThemePreference() {
  manualThemePreference = null;
  localStorage.removeItem(themeStorageKey);
  applyTheme(systemPrefersDark.matches ? 'dark' : 'light', false);
}

function initializeThemeToggle() {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored, true);
    manualThemePreference = stored;
  } else {
    applyTheme(systemPrefersDark.matches ? 'dark' : 'light', false);
  }
  systemPrefersDark.addEventListener('change', (event) => {
    if (manualThemePreference) return;
    applyTheme(event.matches ? 'dark' : 'light', false);
  });
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  }
  const resetBtn = document.getElementById('themeResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetThemePreference);
  }
}

initializeThemeToggle();
let pendingRoundDeleteIndex = null;

const pointValueLabelPlugin = {
  id: 'pointValueLabelPlugin',
  afterDatasetsDraw(chart, _args, options = {}) {
    if (!options.enabled) return;
    const ctx = chart.ctx;
    const font = options.font || '600 14px Arial';
    const offsetY = options.offsetY ?? -10;
    const textBaseline = options.textBaseline || 'bottom';
    const textAlign = options.textAlign || 'center';
    const chartArea = chart.chartArea || {};
    const topBoundary = (chartArea.top ?? 0) + (options.topGuard ?? 10);
    const bottomBoundary = (chartArea.bottom ?? chart.height) - (options.bottomGuard ?? 4);
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || !meta.data) return;
      meta.data.forEach((element, dataIndex) => {
        const total = dataset.pointTotals?.[dataIndex];
        if (total == null) return;
        ctx.save();
        ctx.font = font;
        ctx.textBaseline = textBaseline;
        ctx.textAlign = textAlign;
        ctx.fillStyle = options.useDatasetColor ? (dataset.borderColor || '#111') : (options.color || '#111');
        const rawY = element.y + offsetY;
        const clampedY = Math.min(bottomBoundary, Math.max(topBoundary, rawY));
        ctx.fillText(`${total}`, element.x, clampedY);
        ctx.restore();
      });
    });
  }
};
if (window.Chart && Chart.register) {
  Chart.register(pointValueLabelPlugin);
}

function setSectionExpanded(contentId, expanded) {
  const content = document.getElementById(contentId);
  if (!content) return;
  if (expanded) content.classList.add('expanded');
  else content.classList.remove('expanded');
  const indicatorId = contentId.replace('BreakdownContent', 'Indicator');
  const indicator = document.getElementById(indicatorId);
  if (indicator) indicator.textContent = expanded ? '▾' : '▸';
}

function toggleBreakdownSection(contentId) {
  const content = document.getElementById(contentId);
  if (!content) return;
  const expanded = !content.classList.contains('expanded');
  setSectionExpanded(contentId, expanded);
}

function openSection(contentId) {
  setSectionExpanded(contentId, true);
}

function closeSection(contentId) {
  setSectionExpanded(contentId, false);
}

function ensureIdleBreakdownState() {
  if (!hasActiveGame() && !preparingNewGame) {
    openSection('settingsBreakdownContent');
    closeSection('pointsBreakdownContent');
    closeSection('newRoundBreakdownContent');
    closeSection('roundDetailsBreakdownContent');
    closeSection('savedGamesBreakdownContent');
  }
}

function hasActiveGame() {
  return (roundsTeam1.length + roundsTeam2.length) > 0;
}

function updateStartButtonState() {
  const btn = document.getElementById('startGameToggle');
  if (!btn) return;
  const cancel = document.getElementById('cancelNewGameBtn');
  if (cancel) cancel.style.display = preparingNewGame ? 'inline-flex' : 'none';
  if (preparingNewGame) {
    btn.textContent = 'Spiel starten';
    return;
  }
  btn.textContent = hasActiveGame() ? 'Neues Spiel starten' : 'Spiel starten';
}

function clearSettingsForNewGame() {
  ['team1Name','team2Name','targetPoints1','targetPoints2'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
}

function restoreSavedSettings() {
  if (!savedSettings) return;
  document.getElementById('team1Name').value = savedSettings.team1Name;
  document.getElementById('team2Name').value = savedSettings.team2Name;
  document.getElementById('targetPoints1').value = savedSettings.targetPoints1;
  document.getElementById('targetPoints2').value = savedSettings.targetPoints2;
  savedSettings = null;
}

function beginNewGamePreparation() {
  if (preparingNewGame) return;
  hideVictoryAnimation();
  savedSettings = {
    team1Name: document.getElementById('team1Name').value,
    team2Name: document.getElementById('team2Name').value,
    targetPoints1: document.getElementById('targetPoints1').value,
    targetPoints2: document.getElementById('targetPoints2').value
  };
  clearSettingsForNewGame();
  ensureDefaultTargetPoints();
  preparingNewGame = true;
  unlockSettings();
  prepareForNewGame();
  updateStartButtonState();
}

function handleStartButtonClick() {
  if (preparingNewGame) {
    preparingNewGame = false;
    savedSettings = null;
    newGame();
    startGame();
    return;
  }
  if (hasActiveGame()) {
    beginNewGamePreparation();
    return;
  }
  startGame();
}

function cancelNewGamePreparation() {
  if (!preparingNewGame) return;
  preparingNewGame = false;
  restoreSavedSettings();
  if (hasActiveGame()) {
    lockSettings();
  }
  startGame();
  updateStartButtonState();
}

function startGame() {
  hideVictoryAnimation();
  closeSection('settingsBreakdownContent');
  if (!gameFinished) {
    setRoundEntryEnabled(true);
    openSection('newRoundBreakdownContent');
  }
  openSection('pointsBreakdownContent');
}

function prepareForNewGame() {
  openSection('settingsBreakdownContent');
  closeSection('newRoundBreakdownContent');
  closeSection('pointsBreakdownContent');
  setRoundEntryEnabled(false);
}

function setRoundEntryEnabled(enabled) {
  const ids = ['roundTeam1','roundTeam2','roundWeis1','roundWeis2'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  const btn = document.getElementById('addRoundBtn');
  if (btn) {
    btn.disabled = !enabled || gameFinished;
    if (enabled && !gameFinished) updateAddButtonState();
  }
  const section = document.getElementById('newRoundBreakdownContent');
  if (section) {
    section.classList.toggle('disabled', !enabled);
  }
}

function setCardInputsDisabled(disabled) {
  ['roundTeam1','roundTeam2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

function ensureDefaultTargetPoints() {
  ['targetPoints1','targetPoints2'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    if ((input.value ?? '').toString().trim() === '') {
      input.value = '1000';
    }
  });
}

function showVictoryAnimation(winner, scoreDetail) {
  const overlay = document.getElementById('victoryOverlay');
  const message = document.getElementById('victoryMessage');
  if (!overlay || !message) return;
  const winnerText = winner === 'Beide Teams (gleichzeitig)' ? 'Beide Teams haben gewonnen!' : `${winner} hat gewonnen!`;
  const detailSuffix = scoreDetail ? ` ${scoreDetail} Punkten erreicht` : '';
  message.textContent = `🏆 ${winnerText}${detailSuffix}`;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('active');
  document.body.classList.add('victory-mode');
}

function hideVictoryAnimation() {
  const overlay = document.getElementById('victoryOverlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('active');
  document.body.classList.remove('victory-mode');
}

function goToSettingsForNewGame() {
  hideVictoryAnimation();
  beginNewGamePreparation();
}

// Hilfsfunktion: kumulative Summe
function cumulative(arr) {
  let sum = 0;
  return arr.map(v => sum += v);
}

// Zielpunkte pro Team ermitteln
function getTargetPoints(teamNumber) {
  const t1 = Number(document.getElementById("targetPoints1").value);
  const t2 = Number(document.getElementById("targetPoints2").value);
  // Direkte Zielpunkte pro Team (ohne kleinere/gereizte Sonderlogik)
  return teamNumber === 1 ? t1 : t2;
}

function lockSettings() {
  document.getElementById("team1Name").disabled = true;
  document.getElementById("team2Name").disabled = true;
  document.getElementById("targetPoints1").disabled = true;
  document.getElementById("targetPoints2").disabled = true;
}

function unlockSettings() {
  document.getElementById("team1Name").disabled = false;
  document.getElementById("team2Name").disabled = false;
  document.getElementById("targetPoints1").disabled = false;
  document.getElementById("targetPoints2").disabled = false;
}

// Runde hinzufügen
function addRound() {
  if (gameFinished) { alert("Das Spiel ist beendet. Neues Spiel starten."); return; }

  // Keine Prüfung für gereizte/ungerade Spielerzahl mehr

  // Kartenpunkte: nur eines der Felder muss ausgefüllt sein; das andere wird berechnet (gesamt 160)
  const roundTeam1Input = document.getElementById("roundTeam1");
  const roundTeam2Input = document.getElementById("roundTeam2");
  const match1Checkbox = document.getElementById("roundMatch1");
  const match2Checkbox = document.getElementById("roundMatch2");
  const r1val = roundTeam1Input.value;
  const r2val = roundTeam2Input.value;
  let base1 = r1val === "" ? null : Number(r1val);
  let base2 = r2val === "" ? null : Number(r2val);



  const match1 = (match1Checkbox?.checked === true) || base1 === 260;
  const match2 = (match2Checkbox?.checked === true) || base2 === 260;
  if (match1) {
    base1 = 260;
    if (match1Checkbox) match1Checkbox.checked = true;
  }
  if (match2) {
    base2 = 260;
    if (match2Checkbox) match2Checkbox.checked = true;
  }

  let weis1 = Number(document.getElementById("roundWeis1").value) || 0;
  let weis2 = Number(document.getElementById("roundWeis2").value) || 0;

  // Weisungen: max 3-stellige Zahlen
  if (weis1 < 0 || weis1 > 990 || weis2 < 0 || weis2 > 990) { alert("Weis muss zwischen 0 und 990 liegen."); return; }
  // Weisungen müssen Vielfache von 10 sein
  if ((weis1 % 10) !== 0 || (weis2 % 10) !== 0) { alert("Weis muss ein Vielfaches von 10 sein (0, 10, 20, ...)."); return; }

  // Match-Regel: bei Match 260 Kartenpunkte, Gegner 0
  if (match1) { base2 = 0; }
  if (match2) { base1 = 0; }

  // Berechne fehlende Kartenpunkte
  if (base1 === null && base2 === null) {
    alert("Bitte die Kartenpunkte für mindestens ein Team eingeben."); return;
  }
  if (base1 === null) base1 = 160 - base2;
  if (base2 === null) base2 = 160 - base1;

  // Validierungen: Normale Runden müssen Kartenpunkte 1..159 haben (wenn angegeben).
  if (match1 && match2) {
    alert("Nur ein Team kann ein Match spielen.");
    return;
  }
  if (!match1 && !match2) {
    if (base1 !== null && !isCardPointValueAllowed(base1)) { alert("Kartenpunkte müssen 0-160 oder 260 sein."); return; }
    if (base2 !== null && !isCardPointValueAllowed(base2)) { alert("Kartenpunkte müssen 0-160 oder 260 sein."); return; }
  }

  let p1 = base1 + weis1;
  let p2 = base2 + weis2;

  roundsTeam1.push(p1);
  roundsTeam2.push(p2);
  // store per-round metadata so we can show breakdowns later
  roundsMeta.push({ match: (match1 ? 1 : (match2 ? 2 : 0)), base1: base1, base2: base2, weis1: weis1, weis2: weis2 });

  // Nach der ersten Runde Einstellungen sperren
  if (roundsTeam1.length === 1) lockSettings();

  roundTeam1Input.value = "";
  roundTeam2Input.value = "";
  document.getElementById("roundWeis1").value = 0;
  document.getElementById("roundWeis2").value = 0;
  if (match1Checkbox) match1Checkbox.checked = false;
  if (match2Checkbox) match2Checkbox.checked = false;
  // Re-enable both card inputs after adding round
  document.getElementById("roundTeam1").disabled = false;
  document.getElementById("roundTeam2").disabled = false;

  updateSummary();
  updateChart();
  focusActiveChart();
  renderRounds();
  saveCurrentGame();
  checkGameEnd();
}

// Gesamtpunkte & Gewinneranzeige
function updateSummary() {
  let sum1 = roundsTeam1.reduce((a,b)=>a+b,0);
  let sum2 = roundsTeam2.reduce((a,b)=>a+b,0);
  const name1 = document.getElementById("team1Name").value.substring(0,50) || 'Team 1';
  const name2 = document.getElementById("team2Name").value.substring(0,50) || 'Team 2';

  const target1 = getTargetPoints(1);
  const target2 = getTargetPoints(2);

  // Helper: generate a small circular progress SVG showing percent-to-target

function makeLeaderSVG(isLeader, color) {
  // Strongly simplified stylized icons for clarity:
  // Leader: right-pointing filled triangle (arrow-like)
  // Trailer: small rounded square
  const fill = color || '#9e9e9e';
  if (isLeader) {
    return `<svg viewBox="0 0 24 24" role="img" aria-hidden="true" class="summary-icon"><polygon points="4,4 20,12 4,20" fill="${fill}"/></svg>`;
  } else {
    return `<svg viewBox="0 0 24 24" role="img" aria-hidden="true" class="summary-icon"><rect x="6" y="6" width="12" height="12" rx="3" ry="3" fill="${fill}"/></svg>`;
  }
}

// reopen updateSummary body (continues)

  // Determine which team is proportionally closer to its target
  const pct1 = target1 > 0 ? Math.min(1, sum1 / target1) : 0;
  const pct2 = target2 > 0 ? Math.min(1, sum2 / target2) : 0;

  // Determine colors: leading green, other orange; tie -> both orange
  let p1Class = 'pointsOrange', p2Class = 'pointsOrange';
  if (sum1>sum2) p1Class = 'pointsGreen';
  if (sum2>sum1) p2Class = 'pointsGreen';

  // map CSS classes to the same colors used for scores
  const colorFromClass = (cls) => cls === 'pointsGreen' ? '#0a8a2d' : '#d97706';
  const svg1 = makeLeaderSVG(pct1 >= pct2, colorFromClass(p1Class));
  const svg2 = makeLeaderSVG(pct2 > pct1, colorFromClass(p2Class));

  const col1 = `<div class="summary-line">${svg1}<span class="summary-team-name">${name1}:</span><span class="sumValue"><span class="${p1Class}">${sum1}</span> / ${target1}</span></div>`;
  const col2 = `<div class="summary-line">${svg2}<span class="summary-team-name">${name2}:</span><span class="sumValue"><span class="${p2Class}">${sum2}</span> / ${target2}</span></div>`;

  // add data-team attributes so clicks can toggle breakdowns
  // add onclick handlers so toggling works reliably
  const col1WithData = col1.replace('class="summary-line"', 'class="summary-line" onclick="toggleBreakdown(1)"');
  const col2WithData = col2.replace('class="summary-line"', 'class="summary-line" onclick="toggleBreakdown(2)"');

  const el1 = document.getElementById('sumTeam1');
  const el2 = document.getElementById('sumTeam2');
  // preserve existing breakdown wrapper elements (if any) and re-attach after updating header
  const bd1el = document.getElementById('breakdownTeam1');
  const bd2el = document.getElementById('breakdownTeam2');
  if (el1) {
    // set header only, then re-attach the existing breakdown element so its id stays available
    el1.innerHTML = col1WithData;
    if (bd1el) el1.appendChild(bd1el);
  }
  if (el2) {
    el2.innerHTML = col2WithData;
    if (bd2el) el2.appendChild(bd2el);
  }
  updateStartButtonState();
  renderRoundDetailsTable();
  updateRoundTeamLabels();
}

function updateRoundTeamLabels() {
  const label1 = document.getElementById('roundTeamLabel1');
  const label2 = document.getElementById('roundTeamLabel2');
  const name1 = document.getElementById('team1Name').value.trim() || 'Team 1';
  const name2 = document.getElementById('team2Name').value.trim() || 'Team 2';
  if (label1) label1.textContent = name1;
  if (label2) label2.textContent = name2;
}

// Render per-round breakdown for a team (shows total points and match flag)
function renderTeamBreakdown(team) {
  const container = document.getElementById('breakdownTeam' + team);
  if (!container) return;
  container.innerHTML = '';
  const arr = team === 1 ? roundsTeam1 : roundsTeam2;
  if (!arr || arr.length === 0) {
    container.innerHTML = '<div class="small">Noch keine Runden</div>';
    return;
  }
  const table = document.createElement('table');
  table.className = 'team-breakdown-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Runde</th><th>Kartenpunkte</th><th>Weisung</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  arr.forEach((p, i) => {
    const meta = roundsMeta[i] || {};
    const row = document.createElement('tr');
    const cards = team === 1 ? meta.base1 : meta.base2;
    const weis = team === 1 ? meta.weis1 : meta.weis2;
    const isMatch = meta.match === team;
    const cardDisplay = isMatch ? 'Match' : calculateCardForRow(cards, weis, p);
    const weisDisplay = Number.isFinite(weis) ? weis : Math.max(p - (Number.isFinite(cards) ? cards : 0), 0);
    row.innerHTML = `<td class="round-label">${i+1}</td><td>${cardDisplay}</td><td>${weisDisplay}</td>`;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function calculateCardForRow(cards, weis, total) {
  let cardPts = Number.isFinite(cards) ? cards : null;
  const weisPts = Number.isFinite(weis) ? weis : null;
  if (cardPts === null && weisPts !== null) cardPts = Math.max(total - weisPts, 0);
  if (cardPts === null) cardPts = Math.max(total - (weisPts || 0), 0);
  return Number.isFinite(cardPts) ? cardPts : 0;
}

function renderRoundDetailsTable() {
  const container = document.getElementById('roundDetailsContainer');
  if (!container) return;
  if (!roundsTeam1.length) {
    container.innerHTML = '<div class="small">Noch keine Runden</div>';
    return;
  }
  const team1Name = document.getElementById('team1Name').value || 'Team 1';
  const team2Name = document.getElementById('team2Name').value || 'Team 2';
  const cumulative1 = cumulative(roundsTeam1);
  const cumulative2 = cumulative(roundsTeam2);
  const table = document.createElement('table');
  table.className = 'round-details-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Runde</th><th>${team1Name}</th><th>${team2Name}</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (let roundIdx = roundsTeam1.length - 1; roundIdx >= 0; roundIdx--) {
    const p1 = roundsTeam1[roundIdx] || 0;
    const p2 = roundsTeam2[roundIdx] || 0;
    const meta = roundsMeta[roundIdx] || {};
    const row = document.createElement('tr');
    const t1Detail = formatRoundDetail(meta, 1, p1, cumulative1[roundIdx]);
    const t2Detail = formatRoundDetail(meta, 2, p2, cumulative2[roundIdx]);
    row.innerHTML = `<td class="round-label"><button class="round-delete" type="button" onclick="deleteRound(${roundIdx})" aria-label="Runde ${roundIdx+1} löschen">✕</button><span>${roundIdx+1}</span></td><td>${t1Detail}</td><td>${t2Detail}</td>`;
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}

function formatRoundDetail(meta, team, total, cumulativeTotal) {
  const isMatch = meta.match === team;
  const cards = team === 1 ? meta.base1 : meta.base2;
  const weis = team === 1 ? meta.weis1 : meta.weis2;
  const cumulSpan = formatCumulativeSuffix(cumulativeTotal);
  if (isMatch) {
    const weisPts = Number.isFinite(weis) ? weis : 0;
    return `<span class="round-detail-points"><span>Match</span><span aria-hidden="true">/</span><span>${weisPts}</span>${cumulSpan}</span>`;
  }
  let cardPts = Number.isFinite(cards) ? cards : null;
  let weisPts = Number.isFinite(weis) ? weis : null;
  if (cardPts === null && weisPts === null) {
    cardPts = total;
    weisPts = 0;
  } else if (cardPts === null) {
    cardPts = Math.max(total - weisPts, 0);
  } else if (weisPts === null) {
    weisPts = Math.max(total - cardPts, 0);
  }
  cardPts = Number.isFinite(cardPts) ? cardPts : 0;
  weisPts = Number.isFinite(weisPts) ? weisPts : 0;
  return `<span class="round-detail-points"><span>${cardPts}</span><span aria-hidden="true">/</span><span>${weisPts}</span>${cumulSpan}</span>`;
}

function formatCumulativeSuffix(total) {
  if (!Number.isFinite(total)) return '';
  return `<span class="round-total">(${total})</span>`;
}

function toggleBreakdown(team) {
  const container = document.getElementById('breakdownTeam' + team);
  if (!container) return;
  const isHidden = container.style.display === 'none' || container.style.display === '';
  if (isHidden) {
    renderTeamBreakdown(team);
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}

// Keep delegation fallback removed; using inline onclick on summary-lines for reliability

// Liniendiagramm
function makeLegendLabel(name, total) {
  const pts = Number.isFinite(total) ? total : 0;
  return `${name} (${pts} Punkte)`;
}

function getChartThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const text = (styles.getPropertyValue('--color-text') || '#0f172a').trim();
  const grid = (styles.getPropertyValue('--color-border-soft') || 'rgba(15,23,42,0.08)').trim();
  return { text: text || '#0f172a', grid: grid || 'rgba(15,23,42,0.08)' };
}

function updateChart() {
  const name1 = document.getElementById("team1Name").value.substring(0,50) || 'Team 1';
  const name2 = document.getElementById("team2Name").value.substring(0,50) || 'Team 2';
  const labels = roundsTeam1.map((_,i)=>`Runde ${i+1}`);
  const team1Cumulative = cumulative(roundsTeam1);
  const team2Cumulative = cumulative(roundsTeam2);
  const total1 = team1Cumulative.length ? team1Cumulative[team1Cumulative.length - 1] : 0;
  const total2 = team2Cumulative.length ? team2Cumulative[team2Cumulative.length - 1] : 0;
  const chartColors = getChartThemeColors();

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("pointsChart"), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: makeLegendLabel(name1, total1),
          data: team1Cumulative,
          tension:0.3,
          borderColor: 'rgba(13,74,145,0.95)',
          backgroundColor: 'rgba(13,74,145,0.1)',
          borderWidth: 3,
          pointRadius: 4,
          fill: false
        },
        {
          label: makeLegendLabel(name2, total2),
          data: team2Cumulative,
          tension:0.3,
          borderColor: 'rgba(249,168,37,0.95)',
          backgroundColor: 'rgba(249,168,37,0.15)',
          borderWidth: 3,
          pointRadius: 4,
          fill: false
        }
      ]
    },
    options: {
      color: chartColors.text,
      scales: {
        x: {
          ticks: {
            color: chartColors.text
          },
          grid: {
            color: chartColors.grid
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: chartColors.text
          },
          grid: {
            color: chartColors.grid
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: chartColors.text
          }
        }
      }
    }
  });
  updateMoodChart(name1, name2, labels, team1Cumulative, team2Cumulative, total1, total2);
}

function computeMoodValueFromPercent(percent, modifier) {
  const baselineDiff = percent - 100;
  const adjusted = baselineDiff >= 0
    ? Math.pow(baselineDiff, 1.4)
    : -Math.pow(Math.abs(baselineDiff), 1.6);
  return Math.max(0, Math.min(200, 100 + adjusted + modifier));
}

function updateMoodChart(name1, name2, labels, team1Cumulative, team2Cumulative, total1, total2) {
  const moodLabels = labels.slice();
  const moodData1 = [];
  const moodData2 = [];
  const chartColors = getChartThemeColors();
  for (let i = 0; i < moodLabels.length; i++) {
    const cum1 = team1Cumulative[i] || 0;
    const cum2 = team2Cumulative[i] || 0;
    const total = cum1 + cum2;
    const baseline = total === 0 ? null : total / 2;
    const pct1 = baseline ? (cum1 / baseline) * 100 : 0;
    const pct2 = baseline ? (cum2 / baseline) * 100 : 0;
    const roundMeta = roundsMeta[i] || {};
    const matchEffect1 = roundMeta.match === 1 ? 18 : (roundMeta.match === 2 ? -48 : 0);
    const matchEffect2 = roundMeta.match === 2 ? 18 : (roundMeta.match === 1 ? -48 : 0);
    const moodValue1 = Number.isFinite(pct1) ? computeMoodValueFromPercent(pct1, matchEffect1) : 100;
    const moodValue2 = Number.isFinite(pct2) ? computeMoodValueFromPercent(pct2, matchEffect2) : 100;
    moodData1.push(moodValue1);
    moodData2.push(moodValue2);
  }
  if (moodChart) moodChart.destroy();
  moodChart = new Chart(document.getElementById("moodChart"), {
    type: 'line',
    data: {
      labels: moodLabels,
      datasets: [
        {
          data: moodData1,
          tension: 0.3,
          borderColor: 'rgba(13,74,145,0.95)',
          backgroundColor: 'rgba(13,74,145,0.2)',
          borderWidth: 3,
          pointRadius: 4,
          fill: false,
          pointTotals: team1Cumulative,
          label: makeLegendLabel(name1, total1)
        },
        {
          label: makeLegendLabel(name2, total2),
          data: moodData2,
          tension: 0.3,
          borderColor: 'rgba(249,168,37,0.95)',
          backgroundColor: 'rgba(249,168,37,0.2)',
          borderWidth: 3,
          pointRadius: 4,
          fill: false,
          pointTotals: team2Cumulative
        }
      ]
    },
    options: {
      color: chartColors.text,
      scales: {
        x: {
          ticks: {
            color: chartColors.text
          },
          grid: {
            color: chartColors.grid
          }
        },
        y: {
          beginAtZero: true,
          suggestedMin: 0,
          suggestedMax: 200,
          ticks: {
            stepSize: 40,
            callback: value => {
              if (value === 0) return '😡';
              if (value === 40) return '😠';
              if (value === 80) return '😐';
              if (value === 120) return '🙂';
              if (value === 160) return '😄';
              if (value === 200) return '🥳';
              return '';
            },
            padding: 8,
            font: {
              size: 28
            },
            color: chartColors.text
          },
          grid: {
            color: chartColors.grid
          }
        }
      },
      plugins: {
        pointValueLabelPlugin: {
          enabled: true,
          useDatasetColor: true,
          offsetY: 12,
          textBaseline: 'top',
          topGuard: 32,
          bottomGuard: 8,
          font: '600 14px Arial'
        },
        legend: {
          labels: {
            color: chartColors.text
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.pointTotals?.[ctx.dataIndex] || 0;
              return `${ctx.dataset.label}: ${total} Punkte`;
            }
          }
        }
      }
    }
  });
}

// Rundenliste rendern
function renderRounds() {
  const list = document.getElementById("roundList");
  if (list) {
    list.innerHTML="";
    roundsTeam1.forEach((p1,i)=>{
      const p2 = roundsTeam2[i];
      const li = document.createElement("li");
      const meta = roundsMeta[i] || {match:0};
      let display;
      if (meta.match === 1) display = `Match / 0`;
      else if (meta.match === 2) display = `0 / Match`;
      else display = `${p1} / ${p2}`;
      li.innerHTML = `Runde ${i+1}: ${display} <button onclick="deleteRound(${i})">❌</button>`;
      list.appendChild(li);
    });
  }
  renderRoundDetailsTable();
}

// Runde löschen (eigentliche Logik)
function applyRoundDeletion(index) {
  roundsTeam1.splice(index,1);
  roundsTeam2.splice(index,1);
  roundsMeta.splice(index,1);
  updateSummary();
  updateChart();
  renderRounds();
  checkGameEnd();
  saveCurrentGame();
}

function deleteRound(index) {
  pendingRoundDeleteIndex = index;
  const overlay = document.getElementById('deleteConfirmOverlay');
  if (!overlay) {
    pendingRoundDeleteIndex = null;
    applyRoundDeletion(index);
    return;
  }
  const roundNumberEl = overlay.querySelector('[data-round-number]');
  if (roundNumberEl) roundNumberEl.textContent = `${index + 1}`;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('active');
  document.body.classList.add('confirmation-mode');
}

function hideRoundDeleteConfirmation() {
  pendingRoundDeleteIndex = null;
  const overlay = document.getElementById('deleteConfirmOverlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('active');
  document.body.classList.remove('confirmation-mode');
}

function confirmRoundDeletion() {
  if (pendingRoundDeleteIndex === null || pendingRoundDeleteIndex === undefined) {
    hideRoundDeleteConfirmation();
    return;
  }
  const index = pendingRoundDeleteIndex;
  hideRoundDeleteConfirmation();
  applyRoundDeletion(index);
}

// Spielende prüfen
function checkGameEnd() {
  const sum1 = roundsTeam1.reduce((a,b)=>a+b,0);
  const sum2 = roundsTeam2.reduce((a,b)=>a+b,0);
  const target1 = getTargetPoints(1);
  const target2 = getTargetPoints(2);
  const effectiveTarget1 = Number.isFinite(target1) ? target1 : Infinity;
  const effectiveTarget2 = Number.isFinite(target2) ? target2 : Infinity;
  const team1Won = (effectiveTarget1 !== Infinity) && sum1 >= effectiveTarget1;
  const team2Won = (effectiveTarget2 !== Infinity) && sum2 >= effectiveTarget2;
  const hasWinner = team1Won || team2Won;

  if (hasWinner) {
    let winner;
    if (team1Won && team2Won) winner = "Beide Teams (gleichzeitig)";
    else if (team1Won) winner = document.getElementById("team1Name").value || 'Team 1';
    else winner = document.getElementById("team2Name").value || 'Team 2';
    if (!gameFinished) {
      const formatTargetForDisplay = value => Number.isFinite(value) ? value : 0;
      const detailText = team1Won && team2Won
        ? `${sum1} von ${formatTargetForDisplay(target1)} bzw. ${sum2} von ${formatTargetForDisplay(target2)}`
        : (() => {
          const score = team1Won ? sum1 : sum2;
          const target = team1Won ? formatTargetForDisplay(target1) : formatTargetForDisplay(target2);
          return `${score} von ${target}`;
        })();
      showVictoryAnimation(winner, detailText);
    }
    gameFinished = true;
    setRoundEntryEnabled(false);
    setCardInputsDisabled(true);
    closeSection('newRoundBreakdownContent');
    updateStartButtonState();
    return;
  }

  if (gameFinished) {
    hideVictoryAnimation();
  }
  gameFinished = false;
  setRoundEntryEnabled(true);
  setCardInputsDisabled(false);
  openSection('newRoundBreakdownContent');
  updateStartButtonState();
}

// Neues Spiel
function newGame() {
  preparingNewGame = false;
  savedSettings = null;
  if (roundsTeam1.length>0) saveCurrentGame();
  hideVictoryAnimation();
  roundsTeam1=[]; roundsTeam2=[];
  roundsMeta = [];
  gameFinished=false;
  currentGameId=Date.now();
  // Neue Spiele: Einstellungen wieder aktivierbar
  unlockSettings();
  ensureDefaultTargetPoints();
  prepareForNewGame();
  updateSummary(); updateChart(); renderRounds(); renderGameList();
  updateStartButtonState();
}

// Spiel speichern
function saveCurrentGame() {
  const game={
    id: currentGameId,
    date:new Date().toLocaleString(),
    team1Name:document.getElementById("team1Name").value.substring(0,50),
    team2Name:document.getElementById("team2Name").value.substring(0,50),
    targetPoints1: Number(document.getElementById("targetPoints1").value) || 1000,
    targetPoints2: Number(document.getElementById("targetPoints2").value) || 1000,
    roundsTeam1,
    roundsTeam2,
    roundsMeta
  };
  games=games.filter(g=>g.id!==currentGameId);
  games.push(game);
  localStorage.setItem("jassGames",JSON.stringify(games));
  renderGameList();
}

// Gespeicherte Spiele laden
function loadGames() {
  const data=localStorage.getItem("jassGames");
  if (!data) return;
  games=JSON.parse(data);
  if(games.length>0){
    currentGameId=games[games.length-1].id;
    const last = games[games.length-1];
    roundsTeam1=last.roundsTeam1 || [];
    roundsTeam2=last.roundsTeam2 || [];
    roundsMeta = last.roundsMeta || [];
    document.getElementById("team1Name").value = last.team1Name || document.getElementById("team1Name").value;
    document.getElementById("team2Name").value = last.team2Name || document.getElementById("team2Name").value;
    document.getElementById("targetPoints1").value = last.targetPoints1 || document.getElementById("targetPoints1").value;
    document.getElementById("targetPoints2").value = last.targetPoints2 || document.getElementById("targetPoints2").value;
    // Wenn bereits Runden existieren, Einstellungen sperren
    if ((roundsTeam1.length + roundsTeam2.length) > 0) lockSettings();
  }
  updateSummary(); updateChart(); renderRounds();
  checkGameEnd();
  renderGameList();
  ensureIdleBreakdownState();
}

// Spiel aus Liste laden
function renderGameList() {
  const list=document.getElementById("gameList");
  list.innerHTML="";
  games.forEach(game=>{
    const li=document.createElement("li");
    li.innerHTML=`${game.date} – ${game.team1Name} vs ${game.team2Name} <button onclick="loadGameById(${game.id})">▶</button>`;
    list.appendChild(li);
  });
}

function loadGameById(id) {
  const game=games.find(g=>g.id===id);
  if(!game) return;
  currentGameId=id; gameFinished=false;
  hideVictoryAnimation();
  document.getElementById("team1Name").value=game.team1Name || document.getElementById("team1Name").value;
  document.getElementById("team2Name").value=game.team2Name || document.getElementById("team2Name").value;
  document.getElementById("targetPoints1").value = game.targetPoints1 || document.getElementById("targetPoints1").value;
  document.getElementById("targetPoints2").value = game.targetPoints2 || document.getElementById("targetPoints2").value;
  roundsTeam1=game.roundsTeam1 || []; roundsTeam2=game.roundsTeam2 || [];
  roundsMeta = game.roundsMeta || [];
  if ((roundsTeam1.length + roundsTeam2.length) > 0) lockSettings();
  updateSummary(); updateChart(); renderRounds();
  checkGameEnd();
}

// Initialisierung
loadGames();
// Setup: Toggle disabling of the opposite card input when one is filled
function setupRoundInputToggle() {
  const r1 = document.getElementById("roundTeam1");
  const r2 = document.getElementById("roundTeam2");
  const m1 = document.getElementById("roundMatch1");
  const m2 = document.getElementById("roundMatch2");
  if (!r1 || !r2) return;
  function updateToggle(changed, other, matchBox, oppositeMatchBox) {
    const val = changed.value.toString().trim();
    if (val === '') {
      other.disabled = false;
      other.value = '';
      if (matchBox) matchBox.checked = false;
      return;
    }
    const n = Number(val);
    if (matchBox) {
      const isMatch = Number.isFinite(n) && n === 260;
      matchBox.checked = isMatch;
      if (isMatch && oppositeMatchBox) oppositeMatchBox.checked = false;
    }
    if (Number.isFinite(n)) {
      other.value = n === 260 ? '0' : String(Math.max(160 - n, 0));
    }
    other.disabled = true;
  }
  function wireMatchCheckbox(matchBox, ownInput, oppositeMatchBox) {
    if (!matchBox) return;
    matchBox.addEventListener('change', () => {
      if (matchBox.checked) {
        if (oppositeMatchBox) oppositeMatchBox.checked = false;
        ownInput.value = '260';
      } else if (ownInput.value === '260') {
        ownInput.value = '';
      }
      ownInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  r1.addEventListener('input', ()=>updateToggle(r1,r2,m1,m2));
  r2.addEventListener('input', ()=>updateToggle(r2,r1,m2,m1));
  r1.addEventListener('blur', ()=>{ if (r1.value.toString().trim() === '' && r2.value.toString().trim() === '') r2.disabled = false; });
  r2.addEventListener('blur', ()=>{ if (r2.value.toString().trim() === '' && r1.value.toString().trim() === '') r1.disabled = false; });
  wireMatchCheckbox(m1, r1, m2);
  wireMatchCheckbox(m2, r2, m1);
  updateToggle(r1,r2,m1,m2);
  updateToggle(r2,r1,m2,m1);
}
setupRoundInputToggle();

// Immediate validation for Weis inputs: show hint and mark invalid during typing
function setupWeisImmediateValidation() {
  const w1 = document.getElementById('roundWeis1');
  const w2 = document.getElementById('roundWeis2');
  const h1 = document.getElementById('weisHint1');
  const h2 = document.getElementById('weisHint2');
  if (!w1 || !w2) return;

  function validate(input, hint) {
    const v = input.value;
    if (v === null || v === '') {
      hint.innerText = '';
      input.classList.remove('invalid');
      return true;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 990 || (n % 10) !== 0) {
      hint.innerText = 'Weis muss ein Vielfaches von 10 zwischen 0 und 990 sein.';
      input.classList.add('invalid');
      return false;
    }
    hint.innerText = '';
    input.classList.remove('invalid');
    return true;
  }

  w1.addEventListener('input', ()=> validate(w1,h1));
  w2.addEventListener('input', ()=> validate(w2,h2));
  // initialize
  validate(w1,h1); validate(w2,h2);
}
setupWeisImmediateValidation();
// Immediate validation for Kartenpunkte (roundTeam1/2)
function isCardPointValueAllowed(value) {
  if (!Number.isFinite(value)) return false;
  if (value === 260) return true;
  return Number.isInteger(value) && value >= 0 && value <= 160;
}

function setupCardImmediateValidation() {
  const r1 = document.getElementById('roundTeam1');
  const r2 = document.getElementById('roundTeam2');
  const h1 = document.getElementById('roundHint1');
  const h2 = document.getElementById('roundHint2');
  if (!r1 || !r2) return;

  function validate(input, hint) {
    const v = input.value;
    if (v === null || v === '') {
      hint.innerText = '';
      input.classList.remove('invalid');
      return true;
    }
    const n = Number(v);
    if (!isCardPointValueAllowed(n)) {
      hint.innerText = 'Kartenpunkte müssen ganze Zahlen zwischen 0 und 160 oder 260 sein.';
      input.classList.add('invalid');
      return false;
    }
    hint.innerText = '';
    input.classList.remove('invalid');
    return true;
  }

  r1.addEventListener('input', ()=>{ validate(r1,h1); updateAddButtonState(); });
  r2.addEventListener('input', ()=>{ validate(r2,h2); updateAddButtonState(); });
  validate(r1,h1); validate(r2,h2);
}
setupCardImmediateValidation();
// Enable/disable Add-Round button based on inline validation and required inputs
function updateAddButtonState() {
  const btn = document.getElementById('addRoundBtn');
  if (!btn) return;
  if (gameFinished) { btn.disabled = true; return; }
  const r1 = document.getElementById('roundTeam1');
  const r2 = document.getElementById('roundTeam2');
  const w1 = document.getElementById('roundWeis1');
  const w2 = document.getElementById('roundWeis2');

  // If any round input is marked invalid, disable
  const anyInvalid = !!document.querySelector('#roundTeam1.invalid, #roundTeam2.invalid, #roundWeis1.invalid, #roundWeis2.invalid');
  if (anyInvalid) { btn.disabled = true; return; }

  // Need at least one card input (260 now implies a match implicitly)
  const hasCardInput = (r1 && r1.value.toString().trim() !== '') || (r2 && r2.value.toString().trim() !== '');
  btn.disabled = !hasCardInput;
}

function setupAddButtonToggle() {
  const inputs = ['roundTeam1','roundTeam2','roundWeis1','roundWeis2'];
  inputs.forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', updateAddButtonState);
    el.addEventListener('change', updateAddButtonState);
    el.addEventListener('blur', handleOkFocusAdvance);
  });
  // initialize state
  updateAddButtonState();
}
setupAddButtonToggle();

['team1Name','team2Name'].forEach(id => {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('input', updateRoundTeamLabels);
});

function activateBreakdownTab(panelId) {
  const panels = document.querySelectorAll('#breakdownTabs .tab-panel');
  panels.forEach(panel => panel.classList.toggle('active', panel.id === panelId));
  const buttons = document.querySelectorAll('#breakdownTabs .tab-button');
  buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === panelId));
  focusActiveChart();
}

function setupBreakdownTabs() {
  const buttons = document.querySelectorAll('#breakdownTabs .tab-button');
  buttons.forEach(btn => btn.addEventListener('click', () => activateBreakdownTab(btn.dataset.tab)));
  if (buttons.length && !document.querySelector('#breakdownTabs .tab-panel.active')) {
    activateBreakdownTab(buttons[0].dataset.tab);
  }
}
setupBreakdownTabs();

function focusActiveChart() {
  const activePanel = document.querySelector('#breakdownTabs .tab-panel.active');
  if (!activePanel) return;
  const canvas = activePanel.querySelector('canvas');
  if (!canvas) return;
  canvas.focus();
}

function handleOkFocusAdvance(event) {
  const target = event.target;
  if (!target || target.tagName !== 'INPUT') return;
  const value = (target.value ?? '').toString().trim().toUpperCase();
  if (value !== 'OK') return;
  focusNextInPointsBreakdown(target);
}

function focusNextInPointsBreakdown(current) {
  const container = document.getElementById('pointsBreakdownContent');
  if (!container) return;
  const focusable = Array.from(container.querySelectorAll('input:not([disabled]), button:not([disabled]), canvas[tabindex]'));
  const index = focusable.indexOf(current);
  if (index === -1 || index === focusable.length - 1) return;
  focusable[index + 1].focus();
}
