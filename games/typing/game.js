const historyKey = 'playroom-typing-history';
let paragraphs = [];
let config = { POLL_INTERVAL_SECONDS: 0.035 };
let activeMode = 'type';
let activeSession;
let typingView;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch { return []; }
}

function saveRun(run) {
  localStorage.setItem(historyKey, JSON.stringify([run, ...getHistory()].slice(0, 100)));
}

function formatNumber(value) { return Number.isFinite(value) ? value.toFixed(0) : '—'; }

class TypingSession {
  constructor(text, onUpdate, onFinish) {
    this.text = text;
    this.onUpdate = onUpdate;
    this.onFinish = onFinish;
    this.position = 0;
    this.correct = 0;
    this.mistakes = 0;
    this.startedAt = null;
    this.finished = false;
    this.queue = [];
    this.handleKey = (event) => {
      if (event.key.length === 1 || event.key === 'Backspace') {
        event.preventDefault();
        this.queue.push(event.key);
        if (!this.startedAt) this.startedAt = performance.now();
      }
    };
    window.addEventListener('keydown', this.handleKey);
    this.timer = window.setInterval(() => this.tick(), config.POLL_INTERVAL_SECONDS * 1000);
    this.tick();
  }

  tick() {
    while (this.queue.length && !this.finished) {
      const key = this.queue.shift();
      if (key === this.text[this.position]) {
        this.position += 1;
        this.correct += 1;
        if (this.position === this.text.length) this.finish();
      } else {
        this.mistakes += 1;
        typingView.classList.remove('mistake');
        void typingView.offsetWidth;
        typingView.classList.add('mistake');
      }
    }
    if (!this.finished) this.onUpdate(this);
  }

  elapsedMs() { return this.startedAt ? Math.max(1, performance.now() - this.startedAt) : 0; }

  finish() {
    this.finished = true;
    window.clearInterval(this.timer);
    window.removeEventListener('keydown', this.handleKey);
    const elapsedMinutes = this.elapsedMs() / 60000;
    const accuracy = this.correct / Math.max(this.correct + this.mistakes, 1);
    this.onFinish({ mode: activeMode, correctChars: this.correct, mistakes: this.mistakes, elapsedMs: this.elapsedMs(), cpm: this.correct / Math.max(elapsedMinutes, 1 / 60000), wpm: this.correct / 5 / Math.max(elapsedMinutes, 1 / 60000), accuracy: accuracy * 100, completedAt: Date.now() });
  }

  destroy() {
    window.clearInterval(this.timer);
    window.removeEventListener('keydown', this.handleKey);
  }
}

function textMarkup(text, position, ghostPosition = -1) {
  return [...text].map((character, index) => {
    const state = index < position ? 'typed' : index === position ? 'current' : '';
    const ghost = index === Math.floor(ghostPosition) ? ' ghost-cursor' : '';
    return `<span class="char ${state}${ghost}">${character === ' ' ? ' ' : character}</span>`;
  }).join('');
}

function renderTyping(mode = 'type') {
  activeMode = mode;
  if (activeSession) activeSession.destroy();
  const text = paragraphs[Math.floor(Math.random() * paragraphs.length)] || 'Loading a small paragraph...';
  const best = getHistory().filter((run) => run.mode !== 'race').sort((a, b) => b.cpm - a.cpm)[0];
  const ghostProvider = mode === 'race' && best ? (session) => {
    if (!session.startedAt) return 0;
    const idealPosition = Math.min(text.length, ((performance.now() - session.startedAt) / 60000) * best.cpm);
    return Math.max(0, idealPosition - Math.sin(performance.now() / 800) * (1 - best.accuracy / 100) * 2);
  } : null;
  typingView.innerHTML = `<div class="typing-meta"><span>${mode === 'race' ? 'Your cursor / ghost cursor' : 'Type the passage exactly'}</span><span id="live-stats">Ready when you are</span></div><div class="passage" tabindex="0" aria-label="Typing passage">${textMarkup(text, 0)}</div><div class="typing-footer"><span>${mode === 'race' && best ? `Ghost reference: ${formatNumber(best.cpm)} CPM / ${formatNumber(best.accuracy)}% accuracy` : 'The clock starts with your first keystroke.'}</span><button class="text-button" id="restart-game" type="button">New passage</button></div>`;
  const passage = typingView.querySelector('.passage');
  passage.focus();
  activeSession = new TypingSession(text, (session) => {
    passage.innerHTML = textMarkup(text, session.position, ghostProvider ? ghostProvider(session) : -1);
    typingView.querySelector('#live-stats').textContent = session.startedAt ? `${formatNumber(session.position / Math.max(session.elapsedMs() / 60000, 1 / 60000))} CPM / ${formatNumber(session.correct / Math.max(session.correct + session.mistakes, 1) * 100)}% accuracy` : 'Ready when you are';
  }, (run) => { saveRun(run); renderResult(run); });
  typingView.querySelector('#restart-game').addEventListener('click', () => renderTyping(activeMode));
}

function renderResult(run) {
  typingView.innerHTML = `<div class="result-panel"><p class="section-label">Run complete</p><h3>${formatNumber(run.wpm)} WPM</h3><p>${formatNumber(run.accuracy)}% accuracy / ${formatNumber(run.elapsedMs / 1000)} seconds</p><button class="primary-button" id="restart-game" type="button">Run it again</button><button class="text-button" id="result-stats" type="button">View stats</button></div>`;
  typingView.querySelector('#restart-game').addEventListener('click', () => renderTyping(activeMode));
  typingView.querySelector('#result-stats').addEventListener('click', renderStats);
}

function renderStats() {
  if (activeSession) activeSession.destroy();
  const history = getHistory();
  const recent = history.slice(0, 10);
  const best = history.slice().sort((a, b) => b.wpm - a.wpm)[0];
  const average = recent.length ? recent.reduce((sum, run) => sum + run.wpm, 0) / recent.length : 0;
  const windowRuns = history.slice(1, 6);
  const windowAverage = windowRuns.length ? windowRuns.reduce((sum, run) => sum + run.wpm, 0) / windowRuns.length : average;
  const trend = average - windowAverage;
  const graphRuns = history.length > 10 ? Array.from({ length: 10 }, (_, index) => {
    const bucket = history.slice(Math.floor(index * history.length / 10), Math.floor((index + 1) * history.length / 10));
    return { wpm: bucket.reduce((sum, run) => sum + run.wpm, 0) / bucket.length, accuracy: bucket.reduce((sum, run) => sum + run.accuracy, 0) / bucket.length };
  }) : recent;
  const maxWpm = Math.max(...graphRuns.map((run) => run.wpm), 1);
  const graphBars = (metric, maximum, unit) => graphRuns.length ? graphRuns.slice().reverse().map((run) => `<div class="bar" style="height:${Math.max(8, run[metric] / maximum * 100)}%" title="${formatNumber(run[metric])}${unit}"></div>`).join('') : '<p class="empty-state">Complete a run to grow your graph.</p>';
  const wpmBars = graphBars('wpm', maxWpm, ' WPM');
  const accuracyBars = graphBars('accuracy', 100, '% accuracy');
  const rows = recent.length ? `<div class="run-row run-head"><span>Date</span><span>WPM</span><span>CPM</span><span>Accuracy</span></div>${recent.map((run) => `<div class="run-row"><span>${new Date(run.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><strong>${formatNumber(run.wpm)}</strong><span>${formatNumber(run.cpm)}</span><span>${formatNumber(run.accuracy)}%</span></div>`).join('')}` : '<p class="empty-state">No runs yet. Your next attempt will appear here.</p>';
  typingView.innerHTML = `<div class="stats-summary"><div><span>Latest run</span><strong>${recent[0] ? `${formatNumber(recent[0].wpm)} WPM` : '—'}</strong></div><div><span>Personal best</span><strong>${best ? `${formatNumber(best.wpm)} WPM` : '—'}</strong></div><div><span>Rolling average</span><strong>${recent.length ? `${formatNumber(average)} WPM` : '—'}</strong></div><div><span>Trend</span><strong class="${trend >= 0 ? 'positive' : 'negative'}">${recent.length > 1 ? `${trend >= 0 ? '+' : ''}${formatNumber(trend)} WPM` : '—'}</strong></div></div><div class="chart-grid"><div class="chart-block"><div class="chart-heading"><h3>WPM</h3><span>words per minute</span></div><div class="bar-chart wpm-chart">${wpmBars}</div></div><div class="chart-block"><div class="chart-heading"><h3>Accuracy</h3><span>percentage correct</span></div><div class="bar-chart accuracy-chart">${accuracyBars}</div></div></div><div class="runs-table"><div class="table-heading"><h3>Last 10 runs</h3><span>${history.length} total</span></div>${rows}</div>`;
}

function render(mode = 'type') {
  const renderers = { stats: renderStats, type: renderTyping, race: renderTyping };
  (renderers[mode] || renderTyping)(mode);
}

export function initTypingGame(view) {
  typingView = view;
  const dataUrl = (file) => new URL(file, import.meta.url);
  Promise.all([fetch(dataUrl('./paragraphs.json')).then((response) => response.json()), fetch(dataUrl('./config.json')).then((response) => response.json())]).then(([loadedParagraphs, loadedConfig]) => {
    paragraphs = loadedParagraphs;
    config = loadedConfig;
  }).catch(() => { paragraphs = ['Make a little time for the things that make you curious.']; });

  return {
    render,
    destroy() {
      if (activeSession) activeSession.destroy();
    }
  };
}
