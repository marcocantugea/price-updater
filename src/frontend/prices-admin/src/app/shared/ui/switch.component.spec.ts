import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { SwitchComponent } from './switch.component';

@Component({
  standalone: true,
  imports: [SwitchComponent, ReactiveFormsModule],
  template: `<app-switch [formControl]="control" testId="demo-switch"></app-switch>`
})
class SwitchHostComponent {
  readonly control = new FormControl<boolean>(false, { nonNullable: true });
}

describe('SwitchComponent (spartan BrnSwitch)', () => {
  let fixture: ComponentFixture<SwitchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SwitchComponent] }).compileComponents();
    fixture = TestBed.createComponent(SwitchComponent);
    fixture.detectChanges();
  });

  it('renders the headless brn-switch primitive', () => {
    expect(fixture.nativeElement.querySelector('brn-switch')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('brn-switch-thumb')).toBeTruthy();
  });

  it('reflects the incoming value and toggles the state', () => {
    const component = fixture.componentInstance;
    component.writeValue(true);
    expect(component.checked()).toBe(true);

    component.writeValue(false);
    expect(component.checked()).toBe(false);

    component.onToggle(true);
    expect(component.checked()).toBe(true);
  });

  it('propagates changes and touches through ControlValueAccessor', () => {
    const component = fixture.componentInstance;
    const changes: boolean[] = [];
    let touched = false;

    component.registerOnChange((value) => changes.push(value));
    component.registerOnTouched(() => (touched = true));

    component.onToggle(false);
    component.onToggle(true);

    expect(changes).toEqual([false, true]);
    expect(touched).toBe(true);
  });

  it('honours the disabled state', () => {
    const component = fixture.componentInstance;
    component.setDisabledState(true);
    expect(component.disabled()).toBe(true);

    component.setDisabledState(false);
    expect(component.disabled()).toBe(false);
  });

  it('treats a non-true value as unchecked', () => {
    const component = fixture.componentInstance;
    component.writeValue(undefined as unknown as boolean);
    expect(component.checked()).toBe(false);
  });
});

describe('SwitchComponent inside a reactive form', () => {
  let fixture: ComponentFixture<SwitchHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SwitchHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(SwitchHostComponent);
    fixture.detectChanges();
  });

  it('updates the bound form control when toggled', () => {
    const component = fixture.debugElement.query(By.directive(SwitchComponent)).componentInstance as SwitchComponent;

    component.onToggle(true);
    expect(fixture.componentInstance.control.value).toBe(true);

    component.onToggle(false);
    expect(fixture.componentInstance.control.value).toBe(false);
  });

  it('reflects programmatic control changes', () => {
    const component = fixture.debugElement.query(By.directive(SwitchComponent)).componentInstance as SwitchComponent;

    fixture.componentInstance.control.setValue(true);
    expect(component.checked()).toBe(true);
  });
});
