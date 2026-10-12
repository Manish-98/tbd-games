const repositoryStates = new WeakMap();

export function setRepositoryState(repository, state) {
  repositoryStates.set(repository, state);
}

export function getRepositoryState(repository) {
  const state = repositoryStates.get(repository);

  if (!state) {
    throw new Error('Repository state is not initialized.');
  }

  return state;
}
