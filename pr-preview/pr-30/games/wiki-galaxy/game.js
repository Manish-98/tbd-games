import { escapeHtml } from '../../dom.js';
import { createLifecycle } from '../../shared/lifecycle.js';
import { createGalaxyPositions, formatRankValue, rankValue, RANKING_OPTIONS, sortArticles } from './engine.js';

const API_URL = 'https://en.wikipedia.org/w/api.php';
const AUTOCOMPLETE_URL = 'https://en.wikipedia.org/w/rest.php/v1/search/title';
const PAGEVIEWS_URL = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
const PAGEVIEW_DAYS = 30;
const PAGEVIEW_CONCURRENCY = 8;
const AUTOCOMPLETE_LIMIT = 6;
const AUTOCOMPLETE_DEBOUNCE = 180;

let view = null;
let lifecycle = null;
let mainArticle = '';
let articles = [];
let mainCategories = new Set();
let ranking = 'sharedCategories';
let descending = true;
let loading = false;
let errorMessage = '';
let pageviewsLoaded = false;
let pageviewsLoading = false;
let zoom = 1;
let panX = 0;
let panY = 0;
let pointerState = null;
let suppressClick = false;
let autocompleteTimer = null;
let autocompleteRequest = 0;

function getPageUrl(title) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
}

function normalizeTitle(title) {
  return String(title || '').replaceAll('_', ' ').trim();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.info || 'Wikipedia API request failed.');
  return payload;
}

async function fetchAutocomplete(query) {
  const params = new URLSearchParams({ q: query, limit: String(AUTOCOMPLETE_LIMIT) });
  const payload = await fetchJson(`${AUTOCOMPLETE_URL}?${params}`);
  return (payload.pages || []).map((page) => ({ title: normalizeTitle(page.title), description: page.description || '' }));
}

function hideAutocomplete() {
  autocompleteRequest += 1;
  clearTimeout(autocompleteTimer);
  autocompleteTimer = null;
  const suggestions = view?.querySelector('[data-wiki-suggestions]');
  if (!suggestions) return;
  suggestions.hidden = true;
  suggestions.innerHTML = '';
}

function renderAutocompleteSuggestions(suggestions) {
  const container = view?.querySelector('[data-wiki-suggestions]');
  if (!container) return;
  if (!suggestions.length) { hideAutocomplete(); return; }
  container.innerHTML = suggestions.map((suggestion) => `
    <button class="wiki-suggestion" type="button" data-wiki-suggestion="${escapeHtml(suggestion.title)}">
      <strong>${escapeHtml(suggestion.title)}</strong>
      ${suggestion.description ? `<span>${escapeHtml(suggestion.description)}</span>` : ''}
    </button>
  `).join('');
  container.hidden = false;
}

function scheduleAutocomplete(query) {
  const requestId = ++autocompleteRequest;
  clearTimeout(autocompleteTimer);
  if (query.length < 2) { hideAutocomplete(); return; }
  autocompleteTimer = setTimeout(async () => {
    try {
      const suggestions = await fetchAutocomplete(query);
      if (requestId === autocompleteRequest) renderAutocompleteSuggestions(suggestions);
    } catch {
      if (requestId === autocompleteRequest) hideAutocomplete();
    }
  }, AUTOCOMPLETE_DEBOUNCE);
}

async function fetchMainCategories(title) {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'categories',
    cllimit: '500',
    format: 'json',
    formatversion: '2',
    origin: '*'
  });
  const payload = await fetchJson(`${API_URL}?${params}`);
  const page = payload.query?.pages?.[0];
  return new Set((page?.categories || []).map((category) => category.title));
}

async function fetchLinkedArticles(title, onBatch) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'links',
    titles: title,
    gplnamespace: '0',
    gpllimit: '500',
    prop: 'categories|revisions',
    cllimit: '500',
    rvprop: 'size|timestamp',
    format: 'json',
    formatversion: '2',
    origin: '*'
  });

  const results = new Map();
  let continuation = null;

  do {
    const request = new URLSearchParams(params);
    if (continuation) {
      Object.entries(continuation).forEach(([key, value]) => request.set(key, value));
    }

    const payload = await fetchJson(`${API_URL}?${request}`);
    (payload.query?.pages || []).forEach((page) => {
      const existing = results.get(page.pageid);
      const categories = [...new Set([
        ...(existing?.categories || []),
        ...(page.categories || []).map((category) => category.title)
      ])];
      const revision = page.revisions?.[0];

      results.set(page.pageid, {
        pageid: page.pageid,
        title: normalizeTitle(page.title),
        categories,
        categoryCount: categories.length,
        sharedCategoryCount: categories.filter((category) => mainCategories.has(category)).length,
        articleSize: Number(revision?.size) || existing?.articleSize || 0,
        lastUpdated: revision?.timestamp || existing?.lastUpdated || null,
        pageviews: existing?.pageviews ?? null
      });
    });

    onBatch?.(Array.from(results.values()));
    continuation = payload.continue || null;
  } while (continuation);

  return Array.from(results.values());
}
function dateString(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function getPageviewWindow() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - PAGEVIEW_DAYS + 1);
  return { start: dateString(start), end: dateString(end) };
}

async function fetchPageviews(title) {
  const { start, end } = getPageviewWindow();
  const encodedTitle = encodeURIComponent(title.replaceAll(' ', '_'));
  const url = `${PAGEVIEWS_URL}/en.wikipedia.org/all-access/user/${encodedTitle}/daily/${start}/${end}`;
  try {
    const payload = await fetchJson(url);
    return (payload.items || []).reduce((total, item) => total + (Number(item.views) || 0), 0);
  } catch {
    return 0;
  }
}

async function loadPageviews() {
  if (pageviewsLoaded || pageviewsLoading || !articles.length) return;
  pageviewsLoading = true;
  updateLegend();

  for (let index = 0; index < articles.length; index += PAGEVIEW_CONCURRENCY) {
    const batch = articles.slice(index, index + PAGEVIEW_CONCURRENCY);
    const values = await Promise.all(batch.map((article) => fetchPageviews(article.title)));
    batch.forEach((article, offset) => { article.pageviews = values[offset]; });
    updateLegend();
    drawGalaxy();
  }

  pageviewsLoaded = true;
  pageviewsLoading = false;
  updateLegend();
  drawGalaxy();
}

async function loadArticle(title) {
  const cleaned = normalizeTitle(title);
  if (!cleaned) return;

  loading = true;
  errorMessage = '';
  pageviewsLoaded = false;
  pageviewsLoading = false;
  articles = [];
  resetZoom();
  render();

  mainArticle = cleaned;
  try {
    mainCategories = await fetchMainCategories(cleaned);
    render();
    articles = await fetchLinkedArticles(cleaned, (nextArticles) => {
      articles = nextArticles;
      updateLegend();
      drawGalaxy();
    });
    if (!articles.length) throw new Error('This article has no linked articles in the main namespace.');
    loading = false;
    updateLegend();
    drawGalaxy();
    if (ranking === 'pageviews' && !pageviewsLoaded) loadPageviews();
  } catch (error) {
    loading = false;
    articles = [];
    errorMessage = error instanceof Error ? error.message : 'Could not load this article.';
    render();
  }
}

function renderControls() {
  const options = RANKING_OPTIONS.map((option) => `
    <option value="${option.id}" ${option.id === ranking ? 'selected' : ''}>${option.label}</option>
  `).join('');

  const direction = RANKING_OPTIONS.find((option) => option.id === ranking);
  return `
    <div class="wiki-toolbar">
      <form class="wiki-search" data-wiki-search>
        <div class="wiki-search-input">
          <input type="search" value="${escapeHtml(mainArticle)}" placeholder="Enter a Wikipedia article" aria-label="Wikipedia article" autocomplete="off" data-wiki-input />
          <div class="wiki-suggestions" data-wiki-suggestions hidden></div>
        </div>
        <button class="primary-button" type="submit">Explore</button>
      </form>
      <div class="wiki-ranking">
        <label><span>Rank by</span><select data-wiki-ranking>${options}</select></label>
        <button class="secondary-button" type="button" data-wiki-direction>${direction?.directionLabels[descending ? 1 : 0] || 'Descending'}</button>
      </div>
    </div>
  `;
}

function getLegendStatus() {
  const option = RANKING_OPTIONS.find((entry) => entry.id === ranking);
  if (loading) return 'Mapping…';
  if (ranking === 'pageviews' && pageviewsLoading) return 'Loading pageviews…';
  return `${option?.label || ''} · ${descending ? option?.directionLabels[1] : option?.directionLabels[0]}`;
}

function renderLegend() {
  return `
    <div class="wiki-legend">
      <span><i class="wiki-dot wiki-dot-main"></i>${escapeHtml(mainArticle || 'Main article')}</span>
      <span data-wiki-status>${escapeHtml(getLegendStatus())}</span>
      <span data-wiki-count>${articles.length} linked articles</span>
    </div>
  `;
}

function updateLegend() {
  const status = view?.querySelector('[data-wiki-status]');
  if (status) status.textContent = getLegendStatus();

  const count = view?.querySelector('[data-wiki-count]');
  if (count) count.textContent = `${articles.length} linked articles`;
}

function renderGalaxy() {
  if (errorMessage) return `<div class="wiki-state wiki-error">${escapeHtml(errorMessage)}</div>`;
  if (!loading && !articles.length) return '<div class="wiki-state">Enter a Wikipedia article to begin.</div>';

  if (!loading && ranking === 'pageviews' && !pageviewsLoaded) {
    loadPageviews();
  }

  return `
    <div class="wiki-galaxy-wrap">
      <canvas class="wiki-canvas" width="700" height="700" data-wiki-canvas aria-label="Wikipedia galaxy"></canvas>
      <div class="wiki-hover" data-wiki-hover hidden></div>
      <div class="wiki-zoom-controls" aria-label="Galaxy zoom controls">
        <button class="secondary-button" type="button" data-wiki-zoom-out aria-label="Zoom out">−</button>
        <button class="secondary-button" type="button" data-wiki-zoom-reset>Reset</button>
        <button class="secondary-button" type="button" data-wiki-zoom-in aria-label="Zoom in">+</button>
      </div>
    </div>
  `;
}

function render() {
  if (!view) return;
  view.innerHTML = `
    <div class="wiki-shell">
      ${renderControls()}
      ${renderLegend()}
      ${renderGalaxy()}
    </div>
  `;
  drawGalaxy();
}

function drawGalaxy() {
  const canvas = view.querySelector('[data-wiki-canvas]');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const background = context.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, width * .55);
  background.addColorStop(0, '#202c29');
  background.addColorStop(1, '#101715');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(panX, panY);
  context.scale(zoom, zoom);

  const ranked = sortArticles(articles, ranking, descending);
  const values = ranked.map((article) => rankValue(article, ranking));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const positions = createGalaxyPositions(ranked.length, width, height);

  context.save();
  context.globalAlpha = .14;
  context.strokeStyle = '#abd9cb';
  context.lineWidth = 1;
  [110, 190, 270].forEach((radius) => {
    context.beginPath();
    context.ellipse(width / 2, height / 2, radius, radius * .68, 0, 0, Math.PI * 2);
    context.stroke();
  });
  context.restore();

  ranked.forEach((article, index) => {
    const position = positions[index];
    const normalized = max <= min ? .5 : (rankValue(article, ranking) - min) / (max - min);
    const visual = descending ? normalized : 1 - normalized;
    const radius = 4 + visual * 10;
    const alpha = .25 + visual * .75;

    context.beginPath();
    context.fillStyle = `rgba(244, 211, 125, ${alpha})`;
    context.shadowColor = `rgba(244, 211, 125, ${Math.min(1, alpha)})`;
    context.shadowBlur = 4 + visual * 18;
    context.arc(position.x, position.y, radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  });

  context.beginPath();
  context.fillStyle = '#ef694f';
  context.shadowColor = '#ef694f';
  context.shadowBlur = 28;
  context.arc(width / 2, height / 2, 18, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  context.fillStyle = '#fffef9';
  context.font = '700 13px DM Sans, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillText(mainArticle, width / 2, height / 2 + 27);
  context.restore();
}

function articleAtPoint(event) {
  const canvas = view.querySelector('[data-wiki-canvas]');
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  const screenX = (event.clientX - bounds.left) * scaleX;
  const screenY = (event.clientY - bounds.top) * scaleY;
  const x = (screenX - panX) / zoom;
  const y = (screenY - panY) / zoom;
  const ranked = sortArticles(articles, ranking, descending);
  const values = ranked.map((article) => rankValue(article, ranking));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const positions = createGalaxyPositions(ranked.length, canvas.width, canvas.height);

  for (let index = ranked.length - 1; index >= 0; index -= 1) {
    const article = ranked[index];
    const normalized = max <= min ? .5 : (rankValue(article, ranking) - min) / (max - min);
    const visual = descending ? normalized : 1 - normalized;
    const radius = 4 + visual * 10;
    const dx = x - positions[index].x;
    const dy = y - positions[index].y;
    if (dx * dx + dy * dy <= (radius + 5) ** 2) return { article, x: positions[index].x, y: positions[index].y };
  }
  return null;
}

function showHover(target) {
  const hover = view.querySelector('[data-wiki-hover]');
  if (!hover || !target) return;
  hover.innerHTML = `
    <strong>${escapeHtml(target.article.title)}</strong>
    <span>${escapeHtml(formatRankValue(target.article, ranking))}</span>
    <a href="${getPageUrl(target.article.title)}" target="_blank" rel="noopener noreferrer">Open Wikipedia →</a>
    <button class="wiki-explore-link" type="button" data-wiki-explore="${escapeHtml(target.article.title)}">Explore in Wiki Galaxy →</button>
  `;
  hover.hidden = false;
  const screenX = panX + target.x * zoom;
  const screenY = panY + target.y * zoom;
  hover.style.left = `${screenX / 900 * 100}%`;
  hover.style.top = `${screenY / 600 * 100}%`;
}

function handleSubmit(event) {
  event.preventDefault();
  const input = view.querySelector('[data-wiki-input]');
  hideAutocomplete();
  loadArticle(input?.value || '');
}

function handleInput(event) {
  const input = event.target.closest('[data-wiki-input]');
  if (input) scheduleAutocomplete(normalizeTitle(input.value));
}

function handleClick(event) {
  const suggestion = event.target.closest('[data-wiki-suggestion]');
  if (suggestion) {
    const input = view.querySelector('[data-wiki-input]');
    const title = suggestion.dataset.wikiSuggestion || '';
    if (input) input.value = title;
    hideAutocomplete();
    loadArticle(title);
    return;
  }
  if (!event.target.closest('[data-wiki-search]')) hideAutocomplete();

  const direction = event.target.closest('[data-wiki-direction]');
  if (direction) {
    descending = !descending;
    render();
    return;
  }

  const zoomIn = event.target.closest('[data-wiki-zoom-in]');
  if (zoomIn) {
    setZoom(zoom * 1.25);
    return;
  }

  const zoomOut = event.target.closest('[data-wiki-zoom-out]');
  if (zoomOut) {
    setZoom(zoom / 1.25);
    return;
  }

  const zoomReset = event.target.closest('[data-wiki-zoom-reset]');
  if (zoomReset) {
    resetZoom();
    return;
  }

  const explore = event.target.closest('[data-wiki-explore]');
  if (explore) {
    loadArticle(explore.dataset.wikiExplore);
    return;
  }

  if (suppressClick) {
    suppressClick = false;
    return;
  }

  const target = articleAtPoint(event);
  if (target) {
    showHover(target);
  }
}

function resetZoom() {
  zoom = 1;
  panX = 0;
  panY = 0;
  const hover = view?.querySelector('[data-wiki-hover]');
  if (hover) hover.hidden = true;
  drawGalaxy();
}

function setZoom(nextZoom, screenX = 450, screenY = 300) {
  const next = Math.min(4, Math.max(1, nextZoom));
  if (next === zoom) return;

  const worldX = (screenX - panX) / zoom;
  const worldY = (screenY - panY) / zoom;
  zoom = next;
  panX = screenX - worldX * zoom;
  panY = screenY - worldY * zoom;

  const hover = view?.querySelector('[data-wiki-hover]');
  if (hover) hover.hidden = true;
  drawGalaxy();
}

function handleWheel(event) {
  const canvas = event.target.closest('[data-wiki-canvas]');
  if (!canvas) return;
  event.preventDefault();

  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  const x = (event.clientX - bounds.left) * scaleX;
  const y = (event.clientY - bounds.top) * scaleY;
  setZoom(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), x, y);
}

function handlePointerDown(event) {
  const canvas = event.target.closest('[data-wiki-canvas]');
  if (!canvas || event.button !== 0 || zoom <= 1) return;

  pointerState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    panX,
    panY,
    moved: false
  };
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!pointerState || event.pointerId !== pointerState.pointerId) return;

  const canvas = event.target.closest('[data-wiki-canvas]');
  if (!canvas) return;

  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  const dx = (event.clientX - pointerState.startX) * scaleX;
  const dy = (event.clientY - pointerState.startY) * scaleY;
  if (Math.abs(dx) + Math.abs(dy) > 4) pointerState.moved = true;
  panX = pointerState.panX + dx;
  panY = pointerState.panY + dy;
  drawGalaxy();
}

function handlePointerUp(event) {
  if (!pointerState || event.pointerId !== pointerState.pointerId) return;
  suppressClick = pointerState.moved;
  pointerState = null;
}

function handleChange(event) {
  const rankingControl = event.target.closest('[data-wiki-ranking]');
  if (!rankingControl) return;
  ranking = rankingControl.value;
  updateLegend();
  drawGalaxy();
  if (!loading && ranking === 'pageviews' && !pageviewsLoaded) loadPageviews();
}

export function initWikiGalaxyGame(section) {
  view = section.querySelector('.wiki-view');
  lifecycle = createLifecycle();
  lifecycle.on(view, 'submit', handleSubmit);
  lifecycle.on(view, 'input', handleInput);
  lifecycle.on(view, 'click', handleClick);
  lifecycle.on(view, 'change', handleChange);
  lifecycle.on(view, 'wheel', handleWheel, { passive: false });
  lifecycle.on(view, 'pointerdown', handlePointerDown);
  lifecycle.on(view, 'pointermove', handlePointerMove);
  lifecycle.on(view, 'pointerup', handlePointerUp);
  lifecycle.on(view, 'pointercancel', handlePointerUp);

  render();

  return {
    render() { render(); },
    destroy() {
      lifecycle.dispose();
      lifecycle = null;
      view.innerHTML = '';
      view = null;
      mainArticle = '';
      articles = [];
      mainCategories = new Set();
      pageviewsLoaded = false;
      pageviewsLoading = false;
      zoom = 1;
      panX = 0;
      panY = 0;
      pointerState = null;
      suppressClick = false;
      clearTimeout(autocompleteTimer);
      autocompleteTimer = null;
      autocompleteRequest += 1;
      loading = false;
      errorMessage = '';
    }
  };
}
