import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleFormattingService } from '../i18n/locale-formatting.service';

/**
 * Formats timestamps or database calendar dates for display; em dash when empty.
 *
 * Delegates to `LocaleFormattingService` so the output follows the active locale
 * at runtime (`LOCALE_ID` is a bootstrap token and cannot change). Impure
 * because the pipe argument does not change when the language does.
 */
@Pipe({ name: 'appDate', standalone: true, pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly formatting = inject(LocaleFormattingService);

  transform(value: string | Date | null | undefined, withTime = false, dateOnly = false): string {
    return this.formatting.formatDate(value, { withTime, dateOnly });
  }
}
