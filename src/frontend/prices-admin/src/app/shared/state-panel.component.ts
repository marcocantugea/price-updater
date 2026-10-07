import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

export type PanelState = 'loading' | 'empty' | 'error';

/**
 * Visual states required across every module: loading, empty and error.
 *
 * `title`/`message` are **already resolved strings**: this is a presentational
 * component, so the caller decides how the text is produced (a catalog key via
 * `| transloco`, a `DisplayText` via `| displayText`, or a runtime API value).
 * Keeping them as plain strings avoids allocating a wrapper object on every
 * change-detection cycle just to satisfy an input type.
 *
 * When omitted, the copy falls back to a catalog key, so every consumer inherits
 * localized states without duplicating it.
 */
@Component({
  selector: 'app-state-panel',
  standalone: true,
  imports: [TranslocoPipe],
  template: `
    <div class="pg-card p-10 flex flex-col items-center justify-center text-center gap-3" [attr.data-state]="state()">
      @switch (state()) {
        @case ('loading') {
          <span
            class="h-6 w-6 rounded-full border-2 border-line border-t-forest animate-spin"
            aria-hidden="true"
          ></span>
          <p class="text-sm text-olive" data-testid="state-message">
            {{ message() || ('state.loading' | transloco) }}
          </p>
        }
        @case ('error') {
          <div class="p-2 rounded-lg bg-danger/10 text-danger">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
          </div>
          <p class="text-sm font-medium text-forest" data-testid="state-title">
            {{ title() || ('state.errorTitle' | transloco) }}
          </p>
          <p class="text-sm text-olive max-w-md" data-testid="state-message">{{ message() }}</p>
          @if (showRetry()) {
            <button
              type="button"
              class="mt-2 px-4 py-2 bg-forest text-white rounded-lg text-sm font-medium hover:bg-forest/90 transition-colors"
              data-testid="state-retry"
              (click)="retry.emit()"
            >
              {{ 'crud.retry' | transloco }}
            </button>
          }
        }
        @default {
          <div class="p-2 rounded-lg bg-sidebar text-forest border border-line">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7h18M3 12h18M3 17h10" />
            </svg>
          </div>
          <p class="text-sm font-medium text-forest" data-testid="state-title">
            {{ title() || ('state.emptyTitle' | transloco) }}
          </p>
          @if (message()) {
            <p class="text-sm text-olive max-w-md" data-testid="state-message">{{ message() }}</p>
          }
        }
      }
    </div>
  `
})
export class StatePanelComponent {
  readonly state = input<PanelState>('loading');
  /** Resolved text; when empty it falls back to the catalog. */
  readonly title = input<string>('');
  /** Resolved text; when empty it falls back to the catalog for the loading state. */
  readonly message = input<string>('');
  readonly showRetry = input<boolean>(true);

  readonly retry = output<void>();
}
