import { escapeHtml } from '../../dom.js';
import { createLifecycle } from '../../shared/lifecycle.js';
import { createGalaxyPositions, formatRankValue, rankValue, RANKING_OPTIONS, sortArticles } from './engine.js';

const API_URL = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS_URL = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
const PAGEVIEW_DAYS = 30;
const PAGEVIEW_CONCURRENCY = 8;

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

async function fetchLinkedArticles(title) {
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
      const categories = (page.categories || []).map((category) => category.title);
      results.set(page.pageid, {
        pageid: page.pageid,
        title: normalizeTitle(page.title),
        categories,
        categoryCount: categories.length,
        sharedCategoryCount: categories.filter((category) => mainCategories.has(category)).length,
        articleSize: Number(page.revisions?.[0]?.size) || 0,
        lastUpdated: page.revisions?.[0]?.timestamp || null,
        pageviews: null
      });
    });

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
  render();

  for (let index = 0; index < articles.length; index += PAGEVIEW_CONCURRENCY) {
    const batch = articles.slice(index, index + PAGEVIEW_CONCURRENCY);
    const values = await Promise.all(batch.map((article) => fetchPageviews(article.title)));
    batch.forEach((article, offset) => { article.pageviews = values[offset]; });
    render();
  }

  pageviewsLoaded = true;
  pageviewsLoading = false;
  render();
}

async function loadArticle(title) {
  const cleaned = normalizeTitle(title);
  if (!cleaned) return;

  loading = true;
  errorMessage = '';
  pageviewsLoaded = false;
  pageviewsLoading = false;
  articles = [];
  render();

  try {
    mainArticle = cleaned;
    mainCategories = await fetchMainCategories(cleaned);
    articles = await fetchLinkedArticles(cleaned);
    if (!articles.length) throw new Error('This article has no linked articles in the main namespace.');
    loading = false;
    render();
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
        <input type="search" value="${escapeHtml(mainArticle)}" placeholder="Enter a Wikipedia article" aria-label="Wikipedia article" data-wiki-input />
        <button class="primary-button" type="submit">Explore</button>
      </form>
      <div class="wiki-ranking">
        <label><span>Rank by</span><select data-wiki-ranking>${options}</select></label>
        <button class="secondary-button" type="button" data-wiki-direction>${direction?.directionLabels[descending ? 1 : 0] || 'Descending'}</button>
      </div>
    </div>
  `;
}

function renderLegend() {
  const option = RANKING_OPTIONS.find((entry) => entry.id === ranking);
  const pageviewStatus = ranking === 'pageviews' && pageviewsLoading
    ? 'Loading pageviews…'
    : `${option?.label || ''} · ${descending ? option?.directionLabels[1] : option?.directionLabels[0]}`;
  return `
    <div class="wiki-legend">
      <span><i class="wiki-dot wiki-dot-main"></i>${escapeHtml(mainArticle || 'Main article')}</span>
      <span>${escapeHtml(pageviewStatus)}</span>
      <span>${articles.length} linked articles</span>
    </div>
  `;
}

function renderGalaxy() {
  if (loading) return '<div class="wiki-state">Mapping the galaxy…</div>';
  if (errorMessage) return `<div class="wiki-state wiki-error">${escapeHtml(errorMessage)}</div>`;
  if (!articles.length) return '<div class="wiki-state">Enter a Wikipedia article to begin.</div>';

  if (ranking === 'pageviews' && !pageviewsLoaded) {
    loadPageviews();
  }

  return `
    <div class="wiki-galaxy-wrap">
      <canvas class="wiki-canvas" width="900" height="600" data-wiki-canvas aria-label="Wikipedia galaxy"></canvas>
      <div class="wiki-hover" data-wiki-hover hidden></div>
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
  if (!canvas || !articles.length) return;
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const background = context.createRadialGradient(width / 2, height / 2, 10, width / 2, height / 2, width * .55);
  background.addColorStop(0, '#202c29');
  background.addColorStop(1, '#101715');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const ranked = sortArticles(articles, ranking, descending);
  const values = ranked.map((article) => rankValue(article, ranking));
  const min = Math.min(...values);
  const max = Math.max(...values);
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
}

function articleAtPoint(event) {
  const canvas = view.querySelector('[data-wiki-canvas]');
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  const x = (event.clientX - bounds.left) * scaleX;
  const y = (event.clientY - bounds.top) * scaleY;
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
    <a href="${getPageUrl(target.article.title)}" target="_blank" rel="noopener noreferrer">Open article →</a>
  `;
  hover.hidden = false;
  hover.style.left = `${target.x / 900 * 100}%`;
  hover.style.top = `${target.y / 600 * 100}%`;
}

function handleSubmit(event) {
  event.preventDefault();
  const input = view.querySelector('[data-wiki-input]');
  loadArticle(input?.value || '');
}

function handleClick(event) {
  const direction = event.target.closest('[data-wiki-direction]');
  if (direction) {
    descending = !descending;
    render();
    return;
  }

  const target = articleAtPoint(event);
  if (target) {
    showHover(target);
  }
}

function handleChange(event) {
  const rankingControl = event.target.closest('[data-wiki-ranking]');
  if (!rankingControl) return;
  ranking = rankingControl.value;
  if (ranking === 'pageviews' && !pageviewsLoaded) loadPageviews();
  render();
}

export function initWikiGalaxyGame(section) {
  view = section.querySelector('.wiki-view');
  lifecycle = createLifecycle();
  lifecycle.on(view, 'submit', handleSubmit);
  lifecycle.on(view, 'click', handleClick);
  lifecycle.on(view, 'change', handleChange);

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
      loading = false;
      errorMessage = '';
    }
  };
}
