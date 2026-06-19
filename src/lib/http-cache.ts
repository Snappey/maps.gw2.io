import {catchError, Observable, shareReplay, throwError} from "rxjs";

/**
 * Per-key HTTP response cache with in-flight de-duplication. `cache[key]` holds
 * a shared Observable so concurrent callers share one request and late
 * subscribers get the replayed result; a failure evicts the entry, since a
 * transient error must not poison the cache forever.
 *
 * Prefer this over hand-rolled `{[id]: value}` + `tap` caches, which don't
 * dedupe concurrent in-flight calls.
 */
export function cacheById<T>(
  cache: {[key: string]: Observable<T>},
  key: string,
  factory: () => Observable<T>,
): Observable<T> {
  if (!(key in cache)) {
    cache[key] = factory().pipe(
      catchError(err => {
        delete cache[key];
        return throwError(() => err);
      }),
      shareReplay({bufferSize: 1, refCount: false}),
    );
  }
  return cache[key];
}
