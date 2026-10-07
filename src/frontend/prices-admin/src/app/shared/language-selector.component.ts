import { DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
  viewChildren
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  SUPPORTED_LOCALE_IDS,
  localeMetadata,
  type LocaleMetadata,
  type SupportedLocale
} from '../core/i18n/supported-locales';

/**
 * Reusable globe language selector for the authenticated header.
 *
 * Presentational on purpose: it receives the active locale and emits a
 * canonical one. Persistence, optimistic rollback and session updates belong to
 * the host (the shell), so the same control can later be dropped on the login
 * screen without duplicating that logic. Locale constants live only in
 * `supported-locales.ts`.
 *
 * Accessibility: `aria-haspopup="menu"` + `aria-expanded` on the trigger, and
 * `role="menuitemradio"` + `aria-checked` on the options. The active option is
 * marked with a checkmark as well as styling, so colour is never the only cue.
 */
@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [LucideAngularModule, TranslocoPipe],
  template: `
    <div class="relative" data-testid="language-selector">
      <button
        #trigger
        type="button"
        data-testid="language-selector-trigger"
        class="flex items-center gap-2 rounded-lg border border-line bg-white/70 px-2 py-1.5 text-xs font-medium text-forest transition-colors hover:bg-active/50 focus:outline-none focus:ring-2 focus:ring-forest"
        [attr.aria-label]="triggerLabel()"
        [attr.title]="fullActiveLabel()"
        [attr.aria-busy]="saving()"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
        (keydown)="onTriggerKeydown($event)"
      >
        <!-- The globe stays visible at every width; only the text label collapses. -->
        <lucide-icon name="globe-2" class="h-4 w-4" [class.animate-pulse]="saving()"></lucide-icon>
        <span [class]="labelClass()">{{ activeMetadata().labelKey | transloco }}</span>
        <lucide-icon
          name="chevron-down"
          class="h-3.5 w-3.5 text-olive transition-transform"
          [class.rotate-180]="open()"
        ></lucide-icon>
      </button>

      @if (open()) {
        <div
          role="menu"
          data-testid="language-selector-menu"
          class="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-app"
          (keydown)="onMenuKeydown($event)"
        >
          @for (locale of locales; track locale) {
            <button
              #option
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="locale === activeLocale()"
              [attr.data-testid]="'language-option-' + locale"
              [disabled]="saving()"
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-forest transition-colors hover:bg-active/60 disabled:opacity-60"
              [class.font-semibold]="locale === activeLocale()"
              (click)="select(locale)"
            >
              <!-- Invisible keeps the labels aligned whether or not selected. -->
              <lucide-icon
                name="check"
                class="h-4 w-4"
                [class.invisible]="locale !== activeLocale()"
              ></lucide-icon>
              <span>{{ metadata(locale).fullLabelKey | transloco }}</span>
            </button>
          }
        </div>
      }
    </div>
  `
})
export class LanguageSelectorComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly trigger = viewChildren<ElementRef<HTMLButtonElement>>('trigger');
  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('option');

  /** Current locale; owned by the host so the selector stays presentational. */
  readonly activeLocale = input.required<SupportedLocale>();
  /** While true the options are disabled, which blocks duplicate selection. */
  readonly saving = input(false);
  /**
   * Responsive classes for the text label. The globe is never hidden; only this
   * label collapses. The host widens the breakpoint when a competing header
   * control (the global-admin company selector) needs the space, so the label
   * is always the first thing to disappear.
   */
  readonly labelClass = input('hidden md:inline');

  readonly localeSelected = output<SupportedLocale>();

  readonly locales = SUPPORTED_LOCALE_IDS;
  readonly open = signal(false);

  readonly activeMetadata = computed<LocaleMetadata>(() => localeMetadata(this.activeLocale()));

  /** Full self-name of the active locale, for the tooltip and accessible name. */
  readonly fullActiveLabel = computed<string>(
    () => this.translate(this.activeMetadata().fullLabelKey) ?? this.activeLocale()
  );

  readonly triggerLabel = computed<string>(
    () =>
      this.translate('language.triggerLabel', { language: this.fullActiveLabel() }) ??
      this.fullActiveLabel()
  );

  metadata(locale: SupportedLocale): LocaleMetadata {
    return localeMetadata(locale);
  }

  toggle(): void {
    if (this.saving()) return;
    if (this.open()) {
      this.close(false);
      return;
    }
    this.openMenu(this.activeIndex());
  }

  /** Closes the menu and, when asked, returns focus to the trigger. */
  close(returnFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.focusTrigger();
  }

  select(locale: SupportedLocale): void {
    if (this.saving()) return;

    // Selecting the active locale is a no-op that just dismisses the menu.
    this.close(true);
    if (locale === this.activeLocale()) return;

    this.localeSelected.emit(locale);
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.openMenu(this.activeIndex());
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.openMenu(this.activeIndex(-1));
        return;
      case 'Escape':
        this.close(true);
        return;
      default:
        return;
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocus(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocus(-1);
        return;
      case 'Home':
        event.preventDefault();
        this.focusOption(0);
        return;
      case 'End':
        event.preventDefault();
        this.focusOption(this.locales.length - 1);
        return;
      case 'Tab':
        // Leaving the menu with Tab closes it without stealing focus back.
        this.close(false);
        return;
      default:
        return;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.close(false);
  }

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    this.close(true);
  }

  // --- internals -----------------------------------------------------------

  private activeIndex(offset = 0): number {
    const index = this.locales.indexOf(this.activeLocale());
    return Math.max(0, (index < 0 ? 0 : index) + offset);
  }

  private openMenu(index: number): void {
    this.open.set(true);
    this.focusOption(index);
  }

  private moveFocus(delta: number): void {
    const buttons = this.options();
    if (buttons.length === 0) return;

    const current = buttons.findIndex(
      (button) => button.nativeElement === this.document.activeElement
    );
    const start = current < 0 ? this.activeIndex() : current;
    const next = (start + delta + buttons.length) % buttons.length;
    this.focusOption(next);
  }

  /**
   * The options only exist after the pass that renders them, so the focus move
   * is deferred by a macrotask.
   */
  private focusOption(index: number): void {
    setTimeout(() => {
      const buttons = this.options();
      if (buttons.length === 0) return;
      const target = buttons[Math.min(Math.max(index, 0), buttons.length - 1)];
      target?.nativeElement.focus();
    });
  }

  private focusTrigger(): void {
    setTimeout(() => this.trigger()[0]?.nativeElement.focus());
  }

  private translate(key: string, params?: Record<string, unknown>): string | null {
    try {
      const value = this.transloco.translate(key, params ?? {});
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      // Transloco's missing handler returns the key itself.
      return trimmed === '' || trimmed === key ? null : trimmed;
    } catch {
      return null;
    }
  }
}
