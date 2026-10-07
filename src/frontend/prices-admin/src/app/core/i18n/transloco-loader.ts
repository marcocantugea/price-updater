import { Injectable } from '@angular/core';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';
import { from, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Loads the catalogs through the bundler instead of over HTTP.
 *
 * The `import()` is dynamic and its path is a template literal, so the builder
 * emits one lazily loaded chunk per locale, each carrying a content hash. That is
 * the entire point: the catalogs become content-addressed like every other
 * bundle, so they can never go stale in a browser or CDN cache after a
 * deployment — no matter how many caching layers sit in front of the app — and
 * no extra cache rule is needed anywhere.
 *
 * Because there is no HTTP request, the catalogs also stay out of the interceptor
 * chain: no `Authorization`, no `Accept-Language`, and no dependency on
 * `HttpClient` that could re-enter the injector while a locale is being applied.
 *
 * Only the active locale is imported, so this does not grow the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class BundledTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return from(import(`./catalogs/${lang}.json`)).pipe(
      map((module) => (module as { default: Translation }).default)
    );
  }
}
