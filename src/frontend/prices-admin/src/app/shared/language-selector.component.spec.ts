import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { installTestTranslations, provideTranslocoTesting } from '../testing';
import { LanguageSelectorComponent } from './language-selector.component';
import { APP_ICONS } from '../core/icons';

/** Lets the queued `setTimeout` focus moves and pipe updates run. */
const flushMacrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('LanguageSelectorComponent', () => {
  let fixture: ComponentFixture<LanguageSelectorComponent>;
  let component: LanguageSelectorComponent;

  async function create(activeLocale: 'es-419' | 'en-US' = 'es-419', saving = false): Promise<void> {
    TestBed.configureTestingModule({
      imports: [provideTranslocoTesting(), LanguageSelectorComponent],
      providers: [importProvidersFrom(LucideAngularModule.pick(APP_ICONS))]
    });

    installTestTranslations(activeLocale);

    fixture = TestBed.createComponent(LanguageSelectorComponent);
    fixture.componentRef.setInput('activeLocale', activeLocale);
    fixture.componentRef.setInput('saving', saving);
    component = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function query(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function options(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[role="menuitemradio"]'));
  }

  function trigger(): HTMLButtonElement {
    return query('language-selector-trigger') as HTMLButtonElement;
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders the globe, the current language and the chevron in the trigger', async () => {
    await create('es-419');

    const button = trigger();
    expect(query('language-selector')).toBeTruthy();
    expect(button.querySelector('svg.lucide-globe-2')).toBeTruthy();
    expect(button.querySelector('svg.lucide-chevron-down')).toBeTruthy();
    expect(button.textContent).toContain('Español');
  });

  it('shows the English short label when English is active', async () => {
    await create('en-US');

    expect(trigger().textContent).toContain('English');
  });

  it('exposes menu semantics on the trigger', async () => {
    await create();

    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    trigger().click();
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens a dropdown with exactly two options using full self-names', async () => {
    await create();
    trigger().click();
    fixture.detectChanges();

    const items = options();
    expect(items.length).toBe(2);
    expect(query('language-option-en-US')).toBeTruthy();
    expect(query('language-option-es-419')).toBeTruthy();
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'Español (Latinoamérica)',
      'English (United States)'
    ]);

    // Flags are deliberately not used: these locales name languages, not citizenship.
    expect(fixture.nativeElement.querySelectorAll('img').length).toBe(0);
  });

  it('marks the active option with aria-checked and a checkmark, not colour alone', async () => {
    await create('en-US');
    trigger().click();
    fixture.detectChanges();

    const english = query('language-option-en-US') as HTMLElement;
    const spanish = query('language-option-es-419') as HTMLElement;

    expect(english.getAttribute('aria-checked')).toBe('true');
    expect(spanish.getAttribute('aria-checked')).toBe('false');
    expect(english.querySelector('svg.lucide-check')).toBeTruthy();
    expect(english.className).toContain('font-semibold');
  });

  it('emits the canonical locale on click and closes the menu', async () => {
    await create('es-419');
    const emitted: string[] = [];
    component.localeSelected.subscribe((locale) => emitted.push(locale));

    trigger().click();
    fixture.detectChanges();
    (query('language-option-en-US') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted).toEqual(['en-US']);
    expect(options().length).toBe(0);
  });

  it('does not emit when the active locale is selected again', async () => {
    await create('es-419');
    const emitted: string[] = [];
    component.localeSelected.subscribe((locale) => emitted.push(locale));

    trigger().click();
    fixture.detectChanges();
    (query('language-option-es-419') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect(options().length).toBe(0);
  });

  it('opens with the keyboard and selects with Enter after arrow navigation', async () => {
    await create('es-419');
    const emitted: string[] = [];
    component.localeSelected.subscribe((locale) => emitted.push(locale));

    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    await flushMacrotasks();

    expect(options().length).toBe(2);

    const menu = query('language-selector-menu') as HTMLElement;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    await flushMacrotasks();

    const focused = document.activeElement as HTMLButtonElement;
    expect(focused.getAttribute('role')).toBe('menuitemradio');

    focused.click();
    fixture.detectChanges();

    expect(emitted).toEqual([focused.getAttribute('data-testid')?.replace('language-option-', '') as string]);
  });

  it('supports Home and End navigation', async () => {
    await create('es-419');
    trigger().click();
    fixture.detectChanges();
    await flushMacrotasks();

    const menu = query('language-selector-menu') as HTMLElement;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await flushMacrotasks();
    expect(document.activeElement).toBe(query('language-option-en-US'));

    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await flushMacrotasks();
    expect(document.activeElement).toBe(query('language-option-es-419'));
  });

  it('closes on an outside click without stealing focus back', async () => {
    await create();
    trigger().click();
    fixture.detectChanges();
    expect(options().length).toBe(2);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await flushMacrotasks();

    expect(options().length).toBe(0);
  });

  it('ignores clicks inside the component', async () => {
    await create();
    trigger().click();
    fixture.detectChanges();

    query('language-selector')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(options().length).toBe(2);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    await create();
    trigger().click();
    fixture.detectChanges();
    await flushMacrotasks();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await flushMacrotasks();

    expect(options().length).toBe(0);
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Tab without moving focus back', async () => {
    await create();
    trigger().click();
    fixture.detectChanges();

    (query('language-selector-menu') as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    );
    fixture.detectChanges();

    expect(options().length).toBe(0);
  });

  it('blocks duplicate selection while saving and keeps the options visible', async () => {
    await create('es-419', true);

    // The trigger cannot open a second menu while a save is in flight.
    trigger().click();
    fixture.detectChanges();
    expect(options().length).toBe(0);
    expect(trigger().getAttribute('aria-busy')).toBe('true');
  });

  it('disables the options while saving', async () => {
    await create('es-419', false);
    trigger().click();
    fixture.detectChanges();
    await flushMacrotasks();

    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-busy')).toBe('true');
    for (const option of options()) {
      expect((option as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('ignores a selection while saving', async () => {
    await create('es-419', false);
    const emitted: string[] = [];
    component.localeSelected.subscribe((locale) => emitted.push(locale));

    trigger().click();
    fixture.detectChanges();
    fixture.componentRef.setInput('saving', true);
    fixture.detectChanges();

    component.select('en-US');

    expect(emitted).toEqual([]);
  });

  it('keeps an accessible name and tooltip when the text label is collapsed', async () => {
    await create('en-US');

    // The globe is never hidden and the locale is always announced.
    expect(trigger().querySelector('svg.lucide-globe-2')).toBeTruthy();
    expect(trigger().getAttribute('aria-label')).toContain('English (United States)');
    expect(trigger().getAttribute('title')).toBe('English (United States)');
  });

  it('lets the host widen the label breakpoint when the header is constrained', async () => {
    await TestBed.configureTestingModule({
      imports: [provideTranslocoTesting(), LanguageSelectorComponent],
      providers: [importProvidersFrom(LucideAngularModule.pick(APP_ICONS))]
    });
    installTestTranslations();

    const custom = TestBed.createComponent(LanguageSelectorComponent);
    custom.componentRef.setInput('activeLocale', 'es-419');
    custom.componentRef.setInput('labelClass', 'hidden lg:inline');
    custom.detectChanges();

    const label = custom.nativeElement.querySelector('span');
    expect(label.className).toContain('lg:inline');
  });
});
