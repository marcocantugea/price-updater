import {
  ApplicationConfig,
  importProvidersFrom,
  isDevMode,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideTransloco } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';

import { routes } from './app.routes';
import { APP_ICONS } from './core/icons';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { BundledTranslocoLoader } from './core/i18n/transloco-loader';
import { DEFAULT_LOCALE, SUPPORTED_LOCALE_IDS } from './core/i18n/supported-locales';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    // ngx-charts renders through Angular animations.
    provideAnimationsAsync(),
    // Registers the lucide icons used across the dashboard.
    importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
    // Runtime translations. Only the active catalog is fetched, so adding a
    // language does not grow the initial bundle.
    ...provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LOCALE_IDS],
        defaultLang: DEFAULT_LOCALE,
        // A key missing from one catalog degrades to the other instead of
        // rendering an empty string. The catalog parity test catches the gap.
        fallbackLang: DEFAULT_LOCALE,
        // Templates (pipes/directives) must re-render on a runtime switch.
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: {
          logMissingKey: true,
          useFallbackTranslation: true,
          allowEmpty: false
        }
      },
      loader: BundledTranslocoLoader
    }),
    // jwtInterceptor attaches the token and Accept-Language; errorInterceptor
    // performs the single-flight refresh on 401 and logs out when that fails.
    provideHttpClient(withInterceptors([jwtInterceptor, errorInterceptor]))
  ]
};
