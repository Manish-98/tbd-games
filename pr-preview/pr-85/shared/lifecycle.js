export function createLifecycle() {
  const cleanups = new Set();

  function add(cleanup) {
    cleanups.add(cleanup);
    return cleanup;
  }

  function on(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    return add(() => target.removeEventListener(event, handler, options));
  }

  function interval(callback, delay) {
    const id = window.setInterval(callback, delay);
    return add(() => window.clearInterval(id));
  }

  function timeout(callback, delay) {
    const id = window.setTimeout(callback, delay);
    return add(() => window.clearTimeout(id));
  }

  function dispose() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups.clear();
  }

  return { add, on, interval, timeout, dispose };
}
