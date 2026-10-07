import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/services/auth.service';
import { ApiErrorLocalizerService } from '../../core/i18n/api-error-localizer.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, TranslocoPipe],
  template: `
    <div class="min-h-screen w-full flex items-center justify-center p-6">
      <div class="w-full max-w-md bg-surface rounded-2xl shadow-app border border-line overflow-hidden">
        <div class="bg-header px-8 py-7 border-b border-line">
          <p class="text-sm text-olive mt-2">{{ 'auth.brandTagline' | transloco }}</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="px-8 py-8 space-y-5" data-testid="login-form">
          @if (error()) {
            <div
              class="px-4 py-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-forest"
              data-testid="login-error"
            >
              {{ error() }}
            </div>
          }

          <div>
            <label class="pg-label" for="email">{{ 'auth.email.label' | transloco }}</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              class="pg-input"
              [class.pg-input-invalid]="invalid('email')"
              autocomplete="username"
              [placeholder]="'auth.email.placeholder' | transloco"
            />
            @if (invalid('email')) {
              <p class="text-xs text-danger mt-1">{{ 'auth.email.invalid' | transloco }}</p>
            }
          </div>

          <div>
            <label class="pg-label" for="password">{{ 'auth.password.label' | transloco }}</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              class="pg-input"
              [class.pg-input-invalid]="invalid('password')"
              autocomplete="current-password"
              placeholder="••••••••"
            />
            @if (invalid('password')) {
              <p class="text-xs text-danger mt-1">{{ 'auth.password.invalid' | transloco }}</p>
            }
          </div>

          <button
            type="submit"
            class="w-full px-5 py-2.5 bg-forest text-white rounded-lg text-sm font-medium shadow-sm hover:bg-forest/90 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
            [disabled]="loading()"
            data-testid="login-submit"
          >
            <lucide-icon name="log-in" class="w-4 h-4"></lucide-icon>
            {{ (loading() ? 'auth.submitting' : 'auth.submit') | transloco }}
          </button>

          <p class="text-xs text-olive text-center leading-relaxed">
            {{ 'auth.seedNote' | transloco }}
          </p>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly errorLocalizer = inject(ApiErrorLocalizerService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  invalid(control: string): boolean {
    const field = this.form.get(control);
    return !!field && field.invalid && (field.touched || field.dirty);
  }

  submit(): void {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);

    this.authService.login(String(email), String(password)).subscribe({
      next: () => {
        this.loading.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorLocalizer.message(error));
      }
    });
  }
}
