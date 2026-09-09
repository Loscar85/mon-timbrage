const STORAGE_KEY = 'monTimbrage.v2';
const OLD_STORAGE_KEY = 'monTimbrage.v1';
const $ = id => document.getElementById(id);
const state = loadState();
let currentSessions = [];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return { days: saved.days || [], settings: { dailyTarget: Number(saved.settings?.dailyTarget) || 8.2, workDays: Number(saved.settings?.workDays) || 5 } };
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    const settings = { dailyTarget: old?.settings?.weeklyTarget && old?.settings?.workDays ? old.settings.weeklyTarget / old.settings.workDays : 8.2, workDays: Number(old?.settings?.workDays) || 5 };
    return { days: [], settings };
  } catch { return { days: [], settings: { dailyTarget: 8.2, workDays: 5 } }; }
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function isoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function minutesFromTime(value) { if (!value) return null; const [h, m] = value.split(':').map(Number); return h * 60 + m; }
function timeFromMinutes(total) { const mins = ((Math.round(total) % 1440) + 1440) % 1440; return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`; }
function fmtMinutes(total, signed = false) { const value = Math.round(total); const sign = signed ? (value >= 0 ? '+' : '−') : ''; const abs = Math.abs(value); return `${sign}${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, '0')}`; }
function fmtDecimal(minutes, signed = false) { const value = minutes / 60; const sign = signed && value >= 0 ? '+' : ''; return `${sign}${value.toFixed(2).replace('.', ',')} h`; }
function targetMinutes() { return Math.round(state.settings.dailyTarget * 60); }
function sessionDuration(session) { const start = minutesFromTime(session.start), end = minutesFromTime(session.end); return start === null || end === null || end < start ? 0 : end - start; }
function completedMinutes() { return currentSessions.reduce((sum, s) => sum + sessionDuration(s), 0); }
function startOfWeek(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
function endOfWeek(date) { const d = startOfWeek(date); d.setDate(d.getDate() + 6); return d; }
function weekDays(date) { const start = isoLocal(startOfWeek(date)), end = isoLocal(endOfWeek(date)); return state.days.filter(d => d.date >= start && d.date <= end).sort((a, b) => a.date.localeCompare(b.date)); }

function blankSessions() { return [{ start: '', end: '' }, { start: '', end: '' }]; }
function loadDay(date) {
  const saved = state.days.find(d => d.date === date);
  currentSessions = saved ? saved.sessions.map(s => ({ ...s })) : blankSessions();
  renderSessions();
  updateCalculations();
  $('saveStatus').textContent = saved ? 'Cette journée est déjà enregistrée. Toute modification remplacera ses horaires.' : 'Les calculs se mettent à jour automatiquement.';
}

function renderSessions() {
  $('sessionRows').innerHTML = currentSessions.map((s, index) => `
    <div class="session-row" data-index="${index}">
      <label><span class="mobile-label">Début</span><input class="session-start" type="time" value="${s.start}" aria-label="Début de la plage ${index + 1}" /></label>
      <span class="arrow" aria-hidden="true">→</span>
      <label><span class="mobile-label">Fin</span><input class="session-end" type="time" value="${s.end}" aria-label="Fin de la plage ${index + 1}" /></label>
      <output class="session-duration">${s.start && s.end ? fmtMinutes(sessionDuration(s)) : '—'}</output>
      <output class="session-hundredths">${s.start && s.end ? fmtDecimal(sessionDuration(s)) : '—'}</output>
      <button class="remove-session" type="button" aria-label="Supprimer la plage ${index + 1}">×</button>
    </div>`).join('');
  document.querySelectorAll('.session-start,.session-end').forEach(input => input.addEventListener('input', event => {
    const row = event.target.closest('.session-row'), index = Number(row.dataset.index);
    currentSessions[index][event.target.classList.contains('session-start') ? 'start' : 'end'] = event.target.value;
    updateCalculations();
  }));
  document.querySelectorAll('.remove-session').forEach(button => button.onclick = () => {
    currentSessions.splice(Number(button.closest('.session-row').dataset.index), 1);
    if (!currentSessions.length) currentSessions.push({ start: '', end: '' });
    renderSessions(); updateCalculations();
  });
}

function validateSessions(showMessage = false) {
  const invalid = currentSessions.some(s => s.start && s.end && minutesFromTime(s.end) < minutesFromTime(s.start));
  if (showMessage && invalid) $('saveStatus').textContent = 'Une heure de fin est antérieure à son heure de début.';
  return !invalid;
}
function updateCalculations() {
  validateSessions();
  document.querySelectorAll('.session-row').forEach((row, index) => {
    const s = currentSessions[index], duration = sessionDuration(s);
    row.querySelector('.session-duration').textContent = s.start && s.end ? (minutesFromTime(s.end) >= minutesFromTime(s.start) ? fmtMinutes(duration) : 'Horaire invalide') : '—';
    row.querySelector('.session-hundredths').textContent = s.start && s.end && minutesFromTime(s.end) >= minutesFromTime(s.start) ? fmtDecimal(duration) : '—';
    row.classList.toggle('invalid', Boolean(s.start && s.end && minutesFromTime(s.end) < minutesFromTime(s.start)));
  });
  const total = completedMinutes(), target = targetMinutes(), balance = total - target;
  $('dayTotal').textContent = fmtMinutes(total); $('dayDecimal').textContent = fmtDecimal(total);
  $('dayTarget').textContent = fmtMinutes(target); $('targetDecimal').textContent = `${state.settings.dailyTarget.toFixed(2).replace('.', ',')} h en 1/100e`;
  $('dayBalance').textContent = fmtMinutes(balance, true);
  $('balanceDecimal').textContent = `${fmtDecimal(balance, true)} en 1/100e`;
  $('balanceMessage').textContent = balance >= 0 ? `${fmtMinutes(balance)} au-dessus du minimum` : `Il reste ${fmtMinutes(-balance)} à effectuer`;
  $('balanceCard').classList.toggle('positive', balance >= 0);
  const open = [...currentSessions].reverse().find(s => s.start && !s.end);
  if (open && total < target) {
    $('departureTime').textContent = timeFromMinutes(minutesFromTime(open.start) + (target - total));
    $('departureHint').textContent = `Encore ${fmtMinutes(target - total)} à travailler`;
    $('departureCard').classList.add('ready');
  } else if (total >= target) {
    $('departureTime').textContent = 'Objectif atteint'; $('departureHint').textContent = `${fmtMinutes(balance)} d’avance`; $('departureCard').classList.add('ready');
  } else {
    $('departureTime').textContent = '—'; $('departureHint').textContent = 'Saisis le début de ta plage actuelle'; $('departureCard').classList.remove('ready');
  }
}

function saveDay() {
  if (!validateSessions(true)) return;
  const sessions = currentSessions.filter(s => s.start || s.end);
  if (!sessions.length || sessions.some(s => !s.start || !s.end)) { $('saveStatus').textContent = 'Complète toutes les heures de début et de fin avant d’enregistrer.'; return; }
  const date = $('workDate').value, record = { date, sessions: sessions.map(s => ({ ...s })) }, existing = state.days.findIndex(d => d.date === date);
  if (existing >= 0) state.days[existing] = record; else state.days.push(record);
  persist(); renderWeek(); $('saveStatus').textContent = 'Journée enregistrée ✓';
}
function editDay(date) { $('workDate').value = date; loadDay(date); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function deleteDay(date) { if (!confirm('Supprimer cette journée ?')) return; state.days = state.days.filter(d => d.date !== date); persist(); if ($('workDate').value === date) loadDay(date); renderWeek(); }
function dayMinutes(day) { return day.sessions.reduce((sum, s) => sum + sessionDuration(s), 0); }
function renderWeek() {
  const selected = new Date(`${$('workDate').value}T12:00:00`), days = weekDays(selected), start = startOfWeek(selected), end = endOfWeek(selected);
  $('weekTitle').textContent = `Semaine du ${start.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })} au ${end.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })}`;
  const worked = days.reduce((sum, d) => sum + dayMinutes(d), 0), target = days.length * targetMinutes(), balance = worked - target;
  $('weekWorked').textContent = fmtMinutes(worked); $('weekTarget').textContent = fmtMinutes(target); $('weekBalance').textContent = fmtMinutes(balance, true); $('weekBalance').className = balance >= 0 ? 'positive-text' : 'negative-text';
  $('weekTableBody').innerHTML = days.map(day => {
    const date = new Date(`${day.date}T12:00:00`), total = dayMinutes(day), balance = total - targetMinutes();
    const slots = day.sessions.map(s => `${s.start}–${s.end}`).join(' · ');
    return `<tr><td><strong>${date.toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })}</strong></td><td>${slots}</td><td><strong>${fmtMinutes(total)}</strong></td><td>${fmtDecimal(total)}</td><td class="${balance >= 0 ? 'positive-text' : 'negative-text'}">${fmtMinutes(balance, true)}</td><td><div class="row-actions"><button class="row-button edit-day" data-date="${day.date}" aria-label="Modifier">✎</button><button class="row-button delete-day" data-date="${day.date}" aria-label="Supprimer">×</button></div></td></tr>`;
  }).join('');
  $('emptyState').classList.toggle('visible', !days.length); document.querySelector('.table-wrap').style.display = days.length ? 'block' : 'none';
  document.querySelectorAll('.edit-day').forEach(b => b.onclick = () => editDay(b.dataset.date)); document.querySelectorAll('.delete-day').forEach(b => b.onclick = () => deleteDay(b.dataset.date));
}

$('addSessionBtn').onclick = () => { currentSessions.push({ start: '', end: '' }); renderSessions(); updateCalculations(); document.querySelector('.session-row:last-child .session-start').focus(); };
$('clearDayBtn').onclick = () => { currentSessions = blankSessions(); renderSessions(); updateCalculations(); $('saveStatus').textContent = 'Journée remise à zéro.'; };
$('saveDayBtn').onclick = saveDay;
$('workDate').addEventListener('change', () => { loadDay($('workDate').value); renderWeek(); });
$('settingsBtn').onclick = () => { $('dailyTargetInput').value = state.settings.dailyTarget.toFixed(2); $('workDays').value = state.settings.workDays; $('settingsDialog').showModal(); };
$('settingsForm').addEventListener('submit', e => { if (e.submitter?.value === 'cancel') return; state.settings.dailyTarget = Number($('dailyTargetInput').value); state.settings.workDays = Number($('workDays').value); persist(); updateCalculations(); renderWeek(); } );
$('resetBtn').onclick = () => { if (!confirm('Effacer définitivement toutes les journées enregistrées ?')) return; state.days = []; persist(); $('settingsDialog').close(); loadDay($('workDate').value); renderWeek(); };
$('exportBtn').onclick = () => {
  const lines = ['Date;Timbrages;Total h:min;Total 1/100e;Différence'];
  state.days.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(day => { const total = dayMinutes(day); lines.push([day.date, day.sessions.map(s => `${s.start}-${s.end}`).join(' / '), fmtMinutes(total), (total / 60).toFixed(2).replace('.', ','), fmtMinutes(total - targetMinutes(), true)].join(';')); });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mes-heures-${isoLocal(new Date())}.csv`; a.click(); URL.revokeObjectURL(a.href);
};

$('workDate').value = isoLocal(new Date());
loadDay($('workDate').value);
renderWeek();
