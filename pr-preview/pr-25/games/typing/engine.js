export function calculateTypingMetrics(correct, mistakes, elapsedMs) {
  const elapsedMinutes = Math.max(elapsedMs / 60000, 1 / 60000);
  const total = Math.max(correct + mistakes, 1);
  return {
    cpm: correct / elapsedMinutes,
    wpm: correct / 5 / elapsedMinutes,
    accuracy: (correct / total) * 100
  };
}

export function summarizeRuns(history = [], recentCount = 10) {
  const recent = history.slice(0, recentCount);
  const best = history.slice().sort((a, b) => b.wpm - a.wpm)[0] || null;
  const average = recent.length ? recent.reduce((sum, run) => sum + run.wpm, 0) / recent.length : 0;
  const windowRuns = history.slice(1, 6);
  const windowAverage = windowRuns.length ? windowRuns.reduce((sum, run) => sum + run.wpm, 0) / windowRuns.length : average;
  return { recent, best, average, trend: average - windowAverage };
}

export function aggregateRuns(history = [], bucketCount = 10) {
  if (history.length <= bucketCount) return history;
  return Array.from({ length: bucketCount }, (_, index) => {
    const bucket = history.slice(Math.floor(index * history.length / bucketCount), Math.floor((index + 1) * history.length / bucketCount));
    return {
      wpm: bucket.reduce((sum, run) => sum + run.wpm, 0) / bucket.length,
      accuracy: bucket.reduce((sum, run) => sum + run.accuracy, 0) / bucket.length
    };
  });
}
