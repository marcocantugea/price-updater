import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { DisplayText } from '../../shared/crud-page.types';

/**
 * Resolves `DisplayText` outside a template.
 *
 * Declarative configuration (`ColumnConfig`, `RowAction`, `FieldConfig`,
 * messages) stores catalog keys, so components that need a string in TypeScript
 * — computed titles, toast messages, aria labels — go through this service
 * instead of freezing the translation at construction time.
 *
 * Both methods read `activeLang()` first. That makes any enclosing `computed()`
 * or `effect()` depend on the active language, so imperative callers follow a
 * runtime language switch exactly like the impure template pipe does.
 */
@Injectable({ providedIn: 'root' })
export class DisplayTextService {
  private readonly transloco = inject(TranslocoService);

  /** Resolves a display value; `params` override any carried by the key. */
  resolve(value: DisplayText | null | undefined, params?: Record<string, unknown>): string {
    // Reactive dependency on the active language.
    this.transloco.activeLang();

    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;

    if ('key' in value) {
      return this.translate(value.key, { ...(value.params ?? {}), ...(params ?? {}) });
    }

    return value.text;
  }

  /**
   * Translates a key, interpolating `params`. An unknown key resolves to the key
   * itself so a missing catalog entry is visible during development and is
   * caught by the catalog coverage tests, rather than rendering an empty string.
   */
  translate(key: string, params?: Record<string, unknown>): string {
    this.transloco.activeLang();

    try {
      const value = this.transloco.translate(key, params ?? {});
      return typeof value === 'string' && value.trim() !== '' ? value : key;
    } catch {
      return key;
    }
  }

  /** True when the catalog knows the key (used to pick a fallback). */
  has(key: string): boolean {
    this.transloco.activeLang();

    try {
      const value = this.transloco.translate(key);
      return typeof value === 'string' && value.trim() !== '' && value !== key;
    } catch {
      return false;
    }
  }
}
