import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StatusBadgeComponent } from './status-badge.component';
import { StatePanelComponent } from './state-panel.component';
import { ModalComponent } from './modal.component';
import { DisplayTextPipe } from './display-text.pipe';
import { ToastHostComponent } from './toast-host.component';
import { ToastService } from '../core/services/toast.service';
import type { DisplayText } from './crud-page.types';
import { LanguageService } from '../core/i18n/language.service';
import { installTestTranslations, provideTranslocoTesting } from '../testing';

/** Shared TestBed setup: the shared components render translated copy. */
function configure(component: unknown): void {
  window.localStorage.clear();
  TestBed.configureTestingModule({
    imports: [component as never, provideTranslocoTesting()]
  });
  installTestTranslations();
}

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<StatusBadgeComponent>;
  let language: LanguageService;

  beforeEach(async () => {
    configure(StatusBadgeComponent);
    await TestBed.compileComponents();
    language = TestBed.inject(LanguageService);
    fixture = TestBed.createComponent(StatusBadgeComponent);
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  function render(value: string): HTMLElement {
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('[data-testid="status-badge"]');
  }

  it('renders the Spanish label by default', () => {
    const element = render('active');
    expect(element.textContent).toContain('Activo');
    expect(element.className).toContain('bg-positive/10');
  });

  it('renders inactive, revoked and expired states', () => {
    expect(render('inactive').textContent).toContain('Inactivo');
    expect(render('revoked').textContent).toContain('Revocado');
    expect(render('expired').textContent).toContain('Expirado');
  });

  it('switches language at runtime', () => {
    expect(render('active').textContent).toContain('Activo');

    language.setLocale('en-US');
    fixture.detectChanges();

    expect(render('active').textContent).toContain('Active');
    expect(render('revoked').textContent).toContain('Revoked');
  });

  it('uses a neutral tone for unknown values and keeps them visible', () => {
    const element = render('weird');
    expect(element.textContent).toContain('weird');
    expect(element.className).toContain('bg-sidebar');
  });
});

describe('StatePanelComponent', () => {
  let fixture: ComponentFixture<StatePanelComponent>;
  let language: LanguageService;

  beforeEach(async () => {
    configure(StatePanelComponent);
    await TestBed.compileComponents();
    language = TestBed.inject(LanguageService);
    fixture = TestBed.createComponent(StatePanelComponent);
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  function text(): string {
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  }

  it('renders the localized loading state by default', () => {
    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-state]')).toBeTruthy();
    expect(text()).toContain('Cargando información…');

    language.setLocale('en-US');
    expect(text()).toContain('Loading information…');
  });

  it('renders the empty state with its own title and message', () => {
    fixture.componentRef.setInput('state', 'empty');
    fixture.componentRef.setInput('title', 'Sin productos');
    fixture.componentRef.setInput('message', 'Crea el primero');

    expect(text()).toContain('Sin productos');
    expect(text()).toContain('Crea el primero');
  });

  it('falls back to a catalog key for the empty title', () => {
    fixture.componentRef.setInput('state', 'empty');

    expect(text()).toContain('Sin resultados');

    language.setLocale('en-US');
    expect(text()).toContain('No results');
  });

  it('renders caller-supplied text verbatim and only translates its own fallbacks', () => {
    // The panel is presentational: it takes resolved text, so the caller owns
    // the resolution (an API message stays literal; static copy is bound as
    // `'key' | transloco` at the call site).
    fixture.componentRef.setInput('state', 'empty');
    fixture.componentRef.setInput('title', 'Analista de precios');
    fixture.componentRef.setInput('message', 'Sin conexión');

    expect(text()).toContain('Analista de precios');
    expect(text()).toContain('Sin conexión');

    // Its OWN defaults still come from the catalog and follow the switch.
    fixture.componentRef.setInput('title', '');
    fixture.componentRef.setInput('message', '');

    expect(text()).toContain('Sin resultados');

    language.setLocale('en-US');
    expect(text()).toContain('No results');
  });

  it('renders the error state with a localized title and retry button', () => {
    fixture.componentRef.setInput('state', 'error');
    fixture.componentRef.setInput('message', 'Fallo de red');
    fixture.detectChanges();

    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));

    expect(text()).toContain('No se pudo cargar la información');
    expect(text()).toContain('Reintentar');
    expect(text()).toContain('Fallo de red');

    fixture.debugElement.query(By.css('[data-testid="state-retry"]')).nativeElement.click();
    expect(retried).toBe(true);

    language.setLocale('en-US');
    expect(text()).toContain('The information could not be loaded');
    expect(text()).toContain('Retry');
  });

  it('hides the retry button when disabled', () => {
    fixture.componentRef.setInput('state', 'error');
    fixture.componentRef.setInput('showRetry', false);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('button'))).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [ModalComponent, DisplayTextPipe],
  // The caller resolves the copy: `DisplayText` in, string out.
  template: `<app-modal [open]="open" [title]="title | displayText" (closed)="closed = true"><p>Contenido</p></app-modal>`
})
class ModalHostComponent {
  open = false;
  title: DisplayText = { text: 'Título' };
  closed = false;
}

describe('ModalComponent', () => {
  let fixture: ComponentFixture<ModalHostComponent>;
  let language: LanguageService;

  beforeEach(async () => {
    configure(ModalHostComponent);
    await TestBed.compileComponents();
    language = TestBed.inject(LanguageService);
    fixture = TestBed.createComponent(ModalHostComponent);
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders nothing while closed', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('projects content and emits closed', () => {
    fixture.componentInstance.open = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Contenido');
    expect(fixture.nativeElement.textContent).toContain('Título');

    fixture.debugElement.query(By.css('[data-testid="modal-close"]')).nativeElement.click();
    expect(fixture.componentInstance.closed).toBe(true);
  });

  it('localizes the close button accessible name', () => {
    fixture.componentInstance.open = true;
    fixture.detectChanges();

    const close = () => fixture.nativeElement.querySelector('[data-testid="modal-close"]');
    expect(close().getAttribute('aria-label')).toBe('Cerrar');

    language.setLocale('en-US');
    fixture.detectChanges();

    expect(close().getAttribute('aria-label')).toBe('Close');
  });

  it('accepts a catalog key as the title, resolved by the caller', () => {
    fixture.componentInstance.open = true;
    fixture.componentInstance.title = { key: 'crud.deleteTitle' };
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Confirmar eliminación');

    language.setLocale('en-US');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Confirm deletion');
  });
});

describe('ToastHostComponent', () => {
  let fixture: ComponentFixture<ToastHostComponent>;
  let service: ToastService;

  beforeEach(async () => {
    configure(ToastHostComponent);
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ToastHostComponent);
    service = TestBed.inject(ToastService);
    service.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders queued toasts with their message untouched', () => {
    // Toast messages are produced by the caller (already localized or dynamic
    // business data), so the host must not transform them.
    service.success('Se añadió producto correctamente.');
    service.error('Fallo de red');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Se añadió producto correctamente.');
    expect(text).toContain('Fallo de red');
  });

  it('keeps a dynamic API value verbatim', () => {
    service.info('Amazon');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Amazon');
  });

  it('dismisses a toast', () => {
    const id = service.info('Info');
    fixture.detectChanges();

    fixture.debugElement.query(By.css('button')).nativeElement.click();
    expect(service.toasts().some((toast) => toast.id === id)).toBe(false);
  });

  it('dismisses automatically', (done) => {
    service.show('Temporal', 'info', 10);
    expect(service.toasts().length).toBe(1);

    setTimeout(() => {
      expect(service.toasts().length).toBe(0);
      done();
    }, 30);
  });
});

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
    service.clear();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('queues toasts of each kind', () => {
    service.success('a');
    service.error('b');
    service.info('c');

    expect(service.toasts().map((toast) => toast.kind)).toEqual(['success', 'error', 'info']);
  });

  it('clears every toast', () => {
    service.info('a');
    service.clear();
    expect(service.toasts()).toEqual([]);
  });
});
