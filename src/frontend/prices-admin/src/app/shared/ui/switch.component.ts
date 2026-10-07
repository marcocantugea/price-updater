import {
  Component,
  forwardRef,
  input,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { BrnSwitchComponent, BrnSwitchThumbComponent } from '@spartan-ng/brain/switch';

/**
 * Themed toggle built on spartan/ui's headless `BrnSwitch` primitive.
 *
 * Implements ControlValueAccessor so it can be used directly with
 * `formControlName` inside the reactive forms.
 */
@Component({
  selector: 'app-switch',
  standalone: true,
  imports: [BrnSwitchComponent, BrnSwitchThumbComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SwitchComponent),
      multi: true
    }
  ],
  template: `
    <brn-switch
      class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent
             transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest
             focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      [class.bg-forest]="checked()"
      [class.bg-line]="!checked()"
      [checked]="checked()"
      [disabled]="disabled()"
      [id]="id()"
      [attr.data-testid]="testId()"
      (checkedChange)="onToggle($event)"
      (touched)="onTouched()"
    >
      <brn-switch-thumb
        class="pointer-events-none block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform"
        [class.translate-x-5]="checked()"
        [class.translate-x-0.5]="!checked()"
      ></brn-switch-thumb>
    </brn-switch>
  `
})
export class SwitchComponent implements ControlValueAccessor {
  readonly id = input<string | null>(null);
  readonly testId = input<string>('toggle-switch');

  readonly checked = signal(false);
  readonly disabled = signal(false);

  private onChange: (value: boolean) => void = () => undefined;

  onTouched: () => void = () => undefined;

  writeValue(value: boolean): void {
    this.checked.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onToggle(value: boolean): void {
    this.checked.set(value);
    this.onChange(value);
    this.onTouched();
  }
}
