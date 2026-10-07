import { AbstractControl, ValidationErrors } from '@angular/forms';
import type { ZodTypeAny } from 'zod';
import type { CrossValidator } from '../../shared/crud-page.types';

/**
 * Bridges a Zod schema into an Angular Reactive Forms group validator.
 * Used for the cross-field rules (discount scope consistency, date ranges).
 */
export function zodValidator(schema: ZodTypeAny): CrossValidator {
  return (control: AbstractControl): ValidationErrors | null => {
    const result = schema.safeParse(control.value);
    if (result.success) return null;

    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_form';
      if (!errors[key]) errors[key] = issue.message;
    }

    return { zod: errors };
  };
}

/**
 * Whole numbers only, without coercing.
 *
 * `Number('')` is `0` and `Number('2.5')` is `2.5`, so a validator that merely
 * converted the value would turn a cleared field into a valid zero — exactly the
 * silent default the unit form must not apply to `decimals`. A cleared number
 * input reaches the form as `null`, which this validator reports as missing
 * rather than as zero; `Validators.required` is still what a page needs to make
 * the blank state visible on its own.
 */
export function integerValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;

  if (value === null || value === undefined || value === '') return { integer: true };
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) return { integer: true };
  if (typeof value === 'number' && !Number.isInteger(value)) return { integer: true };
  if (typeof value !== 'number' && typeof value !== 'string') return { integer: true };

  return null;
}
