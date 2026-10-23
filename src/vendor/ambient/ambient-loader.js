// Image loading with a shared cache, bounded retries and exponential backoff.
//
// A superseded request is not cancelled on the network: it stops being awaited but keeps
// downloading into the cache (about 40-140 KB), so the state the visitor tries next is already
// there. `dispose()` cancels everything still in flight.

export class LoadError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = 'LoadError';
    this.status = status;
    this.cause = cause;
  }
}

const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));
// Data textures (masks, light order) must not be colour-managed or premultiplied.
const decodeBitmap = blob => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
const retryable = status => status === undefined || status === 408 || status === 429 || status >= 500;

export function createLoader({
  fetchImpl = (...args) => fetch(...args),
  decode = decodeBitmap,
  retries = 2,
  backoffMs = 400,
  sleep = sleepFor,
} = {}) {
  const cache = new Map();
  const blobs = new Map(); // downloaded bytes kept for <img> elements, so nothing is fetched twice
  const retain = new Set();
  const controller = new AbortController();
  let bytes = 0;

  async function request(url, init) {
    let response;
    try {
      response = await fetchImpl(url, { signal: controller.signal, mode: 'cors', credentials: 'omit', ...init });
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new LoadError(`Network error loading ${url}`, { cause: error });
    }
    if (!response.ok) throw new LoadError(`HTTP ${response.status} loading ${url}`, { status: response.status });
    return response;
  }

  async function attemptImage(url) {
    const blob = await (await request(url)).blob();
    bytes += blob.size;
    if (retain.has(url)) blobs.set(url, blob);
    try {
      return await decode(blob);
    } catch (error) {
      throw new LoadError(`Could not decode ${url}`, { status: 0, cause: error });
    }
  }

  async function attemptJson(url) {
    const response = await request(url, { cache: 'no-cache' }); // the manifest must always be revalidated
    try {
      return await response.json();
    } catch (error) {
      throw new LoadError(`${url} is not valid JSON`, { status: 0, cause: error });
    }
  }

  async function run(url, onRetry, attempt = attemptImage) {
    for (let n = 0; ; n++) {
      try {
        return await attempt(url);
      } catch (error) {
        if (controller.signal.aborted || n >= retries || !retryable(error.status)) throw error;
        onRetry?.(n + 1, error);
        await sleep(backoffMs * 2 ** n);
      }
    }
  }

  /** Resolve with the decoded image. `signal` only stops this caller from waiting. */
  function load(url, { signal, onRetry, retainBlob = false } = {}) {
    if (retainBlob) retain.add(url);
    if (!cache.has(url)) {
      const pending = run(url, onRetry);
      cache.set(url, pending);
      pending.catch(() => { if (cache.get(url) === pending) cache.delete(url); }); // failures are retryable
    }
    const promise = cache.get(url);
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(new DOMException('Superseded', 'AbortError'));
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Superseded', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  }

  return {
    load,
    loadJson: (url, { onRetry } = {}) => run(url, onRetry, attemptJson),
    has: url => cache.has(url),
    blobFor: url => blobs.get(url),
    bytesLoaded: () => bytes,
    dispose() { controller.abort(); cache.clear(); blobs.clear(); retain.clear(); },
  };
}
