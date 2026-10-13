/**
 * Deterministic, topology-first layout for the Git repository commit DAG.
 * Coordinates are independent of the DOM so the graph can be tested in isolation.
 */
const NODE_X = 42;
const LANE_GAP = 54;
const NODE_Y = 58;
const ROW_GAP = 68;

function compareCommits(left, right) {
  const dateOrder = String(left.date || '').localeCompare(String(right.date || ''));
  return dateOrder || String(left.id).localeCompare(String(right.id));
}

export function buildCommitGraph(state) {
  const commits = Object.values(state.commits || {});
  const byId = new Map(commits.map(commit => [commit.id, commit]));
  const children = new Map(commits.map(commit => [commit.id, []]));
  const parentsById = new Map();

  commits.forEach(commit => {
    const parents = [...new Set(commit.parents || [])].filter(id => byId.has(id));
    parentsById.set(commit.id, parents);
    parents.forEach(parentId => children.get(parentId).push(commit));
  });

  children.forEach(list => list.sort(compareCommits));

  // Kahn's algorithm guarantees that parents are placed before their children.
  const indegree = new Map(commits.map(commit => [commit.id, parentsById.get(commit.id).length]));
  const ready = commits.filter(commit => indegree.get(commit.id) === 0).sort(compareCommits);
  const sorted = [];

  while (ready.length) {
    const commit = ready.shift();
    sorted.push(commit);
    children.get(commit.id).forEach(child => {
      const remaining = indegree.get(child.id) - 1;
      indegree.set(child.id, remaining);
      if (remaining === 0) {
        ready.push(child);
        ready.sort(compareCommits);
      }
    });
  }

  // Valid Git histories are acyclic. Keep malformed/orphaned fixtures renderable,
  // but place any cyclic remainder deterministically after the valid topological prefix.
  if (sorted.length !== commits.length) {
    const placed = new Set(sorted.map(commit => commit.id));
    sorted.push(...commits.filter(commit => !placed.has(commit.id)).sort(compareCommits));
  }

  // Prefer the child with the largest reachable history as the continuation of a lane.
  // Sibling branches receive new lanes, rather than being assigned by array index.
  const descendants = new Map();
  [...sorted].reverse().forEach(commit => {
    const reachable = new Set();
    children.get(commit.id).forEach(child => {
      reachable.add(child.id);
      (descendants.get(child.id) || new Set()).forEach(id => reachable.add(id));
    });
    descendants.set(commit.id, reachable);
  });

  const continuation = new Map();
  children.forEach((childList, parentId) => {
    if (!childList.length) return;
    const ranked = [...childList].sort((left, right) => {
      const sizeDifference = (descendants.get(right.id)?.size || 0) -
        (descendants.get(left.id)?.size || 0);
      return sizeDifference || compareCommits(left, right);
    });
    continuation.set(parentId, ranked[0].id);
  });

  const lanes = new Map();
  let nextLane = 0;
  sorted.forEach(commit => {
    const parents = parentsById.get(commit.id);
    const firstParent = parents[0];
    if (firstParent && continuation.get(firstParent) === commit.id && lanes.has(firstParent)) {
      lanes.set(commit.id, lanes.get(firstParent));
    } else {
      lanes.set(commit.id, nextLane++);
    }
  });

  const positions = new Map();
  sorted.forEach((commit, index) => {
    positions.set(commit.id, {
      x: NODE_X + lanes.get(commit.id) * LANE_GAP,
      y: NODE_Y + index * ROW_GAP,
      lane: lanes.get(commit.id),
      order: index
    });
  });

  const maxX = Math.max(NODE_X, ...[...positions.values()].map(position => position.x));
  // Keep the graph lanes in a dedicated left column and reserve a fixed
  // metadata column on the right, aligned to each commit's row.
  const metadataX = maxX + 74;
  return {
    commits: sorted,
    positions,
    lanes,
    metadataX,
    width: Math.max(640, metadataX + 560),
    height: Math.max(250, sorted.length * ROW_GAP + 48)
  };
}
