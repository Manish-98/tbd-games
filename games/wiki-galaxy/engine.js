export const RANKING_OPTIONS = [
  { id: 'pageviews', label: 'Pageviews', directionLabels: ['Low → high', 'High → low'] },
  { id: 'categoryCount', label: 'Category count', directionLabels: ['Fewest', 'Most'] },
  { id: 'sharedCategories', label: 'Shared categories', directionLabels: ['Fewest', 'Most'] },
  { id: 'articleSize', label: 'Article size', directionLabels: ['Smallest', 'Largest'] },
  { id: 'lastUpdated', label: 'Last updated', directionLabels: ['Least recent', 'Most recent'] }
];

export function rankValue(article, ranking) {
  if (ranking === 'pageviews') return article.pageviews ?? 0;
  if (ranking === 'categoryCount') return article.categoryCount ?? 0;
  if (ranking === 'sharedCategories') return article.sharedCategoryCount ?? 0;
  if (ranking === 'articleSize') return article.articleSize ?? 0;
  if (ranking === 'lastUpdated') return article.lastUpdated ? Date.parse(article.lastUpdated) : 0;
  return 0;
}

export function sortArticles(articles, ranking, descending = true) {
  return [...articles].sort((a, b) => {
    const difference = rankValue(a, ranking) - rankValue(b, ranking);
    if (difference !== 0) return descending ? -difference : difference;
    return a.title.localeCompare(b.title);
  });
}

export function normalizeScore(value, min, max) {
  if (max <= min) return 0.5;
  return (value - min) / (max - min);
}

export function createGalaxyPositions(count, width, height) {
  if (!count) return [];
  const cx = width / 2;
  const cy = height / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const positions = [];

  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1);
    const radius = 35 + Math.sqrt(t) * Math.min(width, height) * 0.42;
    const angle = index * goldenAngle;
    positions.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.68
    });
  }
  return positions;
}

export function formatRankValue(article, ranking) {
  const value = rankValue(article, ranking);
  if (ranking === 'pageviews') return value.toLocaleString();
  if (ranking === 'articleSize') return value >= 1000000
    ? `${(value / 1000000).toFixed(1)} MB`
    : value >= 1000
      ? `${(value / 1000).toFixed(1)} KB`
      : `${value} B`;
  if (ranking === 'lastUpdated') return article.lastUpdated
    ? new Date(article.lastUpdated).toLocaleDateString()
    : 'Unknown';
  return value.toLocaleString();
}
