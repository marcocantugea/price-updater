import { Pipe, PipeTransform, inject } from '@angular/core';
import { DisplayTextService } from '../i18n/display-text.service';

/**
 * Translates API status values into UI copy using stable codes.
 *
 * The lookup is by code (`active`, `inactive`, `revoked`, `expired`, ...), so
 * the translated value follows a runtime language switch. An unknown code falls
 * back to the raw API value, which keeps new backend statuses visible instead of
 * blanking them.
 *
 * Impure on purpose: the pipe argument (the status code) does not change when the
 * language does, so a pure pipe would keep the translation it memoized first.
 */
@Pipe({ name: 'statusLabel', standalone: true, pure: false })
export class StatusLabelPipe implements PipeTransform {
  private readonly text = inject(DisplayTextService);

  transform(value: string | null | undefined): string {
    if (!value) return '—';

    const key = `status.${value}`;
    return this.text.has(key) ? this.text.translate(key) : value;
  }
}
