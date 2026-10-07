import { TestBed } from '@angular/core/testing';
import { provideTranslocoTesting } from './testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
  window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent, provideTranslocoTesting()],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  it('creates the root component', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
