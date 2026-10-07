import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Accessible modal shell used by every create/edit form and confirmation.
 *
 * `title`/`subtitle` are **already resolved strings**: this is a presentational
 * component, so the caller decides how the text is produced. A static label is
 * passed as `[title]="'namespace.key' | transloco"`, which keeps the copy in a
 * catalog without allocating a wrapper object on every change-detection cycle.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [TranslocoPipe],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto" role="dialog" aria-modal="true">
        <div class="fixed inset-0 bg-forest/40" (click)="closed.emit()"></div>

        <div class="relative w-full max-w-2xl bg-surface rounded-2xl shadow-app border border-line my-8">
          <header class="flex items-start justify-between gap-4 px-6 py-4 border-b border-line">
            <div>
              <h2 class="text-lg font-semibold text-forest">{{ title() }}</h2>
              @if (subtitle()) {
                <p class="text-sm text-olive mt-0.5">{{ subtitle() }}</p>
              }
            </div>
            <button
              type="button"
              class="p-1.5 rounded-lg text-olive hover:bg-active hover:text-forest transition-colors"
              [attr.aria-label]="'common.close' | transloco"
              data-testid="modal-close"
              (click)="closed.emit()"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div class="px-6 py-5">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    }
  `
})
export class ModalComponent {
  readonly open = input<boolean>(false);
  /** Resolved text, produced by the caller with a pipe. */
  readonly title = input<string>('');
  readonly subtitle = input<string>('');

  readonly closed = output<void>();
}
