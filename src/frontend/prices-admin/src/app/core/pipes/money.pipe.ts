import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleFormattingService } from '../i18n/locale-formatting.service';

/**
 * Formats a monetary amount using the price currency.
 *
 * The currency code is never translated; only the separators and symbol
 * placement follow the active locale. Delegates to `LocaleFormattingService`,
 * and is impure so it re-renders after a language switch.
 */
@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly formatting = inject(LocaleFormattingService);

  transform(value: number | string | null | undefined, currency = 'MXN'): string {
    return this.formatting.formatMoney(value, currency);
  }
}
