import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrecioGoLogoComponent } from './preciogo-logo.component';

describe('PrecioGoLogoComponent', () => {
  let fixture: ComponentFixture<PrecioGoLogoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PrecioGoLogoComponent] }).compileComponents();
    fixture = TestBed.createComponent(PrecioGoLogoComponent);
  });

  afterEach(() => TestBed.resetTestingModule());

  function render(height?: number, decorative?: boolean): SVGElement {
    if (height !== undefined) fixture.componentRef.setInput('height', height);
    if (decorative !== undefined) fixture.componentRef.setInput('decorative', decorative);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('svg') as SVGElement;
  }

  it('renders the approved compact lockup proportions', () => {
    const svg = render();

    expect(svg.getAttribute('viewBox')).toBe('0 0 172 44');
    // The sidebar must not start from the large horizontal asset.
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMinYMid meet');
  });

  it('renders the wordmark as one word with the approved capitalization', () => {
    const svg = render();
    const words = Array.from(svg.querySelectorAll('text')).map((node) => node.textContent);

    expect(words).toEqual(['$', 'Precio', 'Go']);
  });

  it('uses the UI palette tokens from the brand guide', () => {
    const markup = render().outerHTML;

    // Ink, UI sage, UI orange and the UI word orange of the compact lockup.
    expect(markup).toContain('#080808');
    expect(markup).toContain('#5F8467');
    expect(markup).toContain('#C86500');
    expect(markup).toContain('#A34E00');
    expect(markup).toContain('#3673A2');
  });

  it('is decorative by default, because adjacent text already names the product', () => {
    const svg = render();

    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('aria-labelledby')).toBeNull();
  });

  it('exposes an accessible name when it is the only product label', () => {
    const svg = render(undefined, false);
    const labelledBy = svg.getAttribute('aria-labelledby');
    const title = svg.querySelector('title');

    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(labelledBy).toBeTruthy();
    expect(title?.getAttribute('id')).toBe(labelledBy);
    expect(title?.textContent?.trim()).toBe('PrecioGo');
  });

  it('namespaces the title id so two instances never collide', () => {
    const first = render(undefined, false).querySelector('title')?.getAttribute('id');
    const second = TestBed.createComponent(PrecioGoLogoComponent);
    second.componentRef.setInput('decorative', false);
    second.detectChanges();
    const secondId = second.nativeElement.querySelector('title')?.getAttribute('id');

    expect(first).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(first);
  });

  it('defaults to the 44 px sidebar height and applies a requested height', () => {
    const svg = render();
    expect(svg.parentElement?.style.height).toBe('44px');

    const taller = render(48);
    expect(taller.parentElement?.style.height).toBe('48px');
  });

  it('keeps the SVG stretched to the requested height so the ratio holds', () => {
    const svg = render(48);

    expect(svg.getAttribute('class')).toContain('h-full');
    expect(svg.getAttribute('class')).toContain('w-auto');
  });
});
