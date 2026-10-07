import { Pipe, PipeTransform, inject } from '@angular/core';
import { DisplayTextService } from '../core/i18n/display-text.service';
import type { DisplayText } from './crud-page.types';

/**
 * Resolves `DisplayText` into a string at render time.
 *
 * Impure on purpose: a pure pipe is memoized on its arguments, so it would not
 * re-run when the active language changes and declarative configuration would
 * keep rendering the language that was active when it was first displayed.
 * `DisplayTextService.resolve` is a cached map lookup plus one interpolation
 * regex, so re-evaluating a handful of labels per change-detection cycle is
 * cheap. Phase 4 should re-measure this against large tables, where passing the
 * active locale as an explicit argument (and staying pure) may be the better
 * trade.
 *
 * Required because `strictTemplates` forbids reading `.key`/`.text` off the
 * `DisplayText` union directly in a template.
 */
@Pipe({ name: 'displayText', standalone: true, pure: false })
export class DisplayTextPipe implements PipeTransform {
  private readonly text = inject(DisplayTextService);

  transform(value: DisplayText | null | undefined, params?: Record<string, unknown>): string {
    return this.text.resolve(value, params);
  }
}
