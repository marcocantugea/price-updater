import { Component, inject } from '@angular/core';
import { ToastService } from '../core/services/toast.service';

/** Renders the transient success/error feedback queue. */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 max-w-sm">
      @for (toast of toasts(); track toast.id) {
        <div
          class="flex items-start gap-3 px-4 py-3 rounded-xl border shadow-soft text-sm"
          [class]="toneFor(toast.kind)"
          role="status"
        >
          <span class="flex-1">{{ toast.message }}</span>
          <button type="button" class="opacity-60 hover:opacity-100" (click)="dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `
})
export class ToastHostComponent {
  private readonly toastService = inject(ToastService);
  readonly toasts = this.toastService.toasts;

  toneFor(kind: string): string {
    switch (kind) {
      case 'success':
        return 'bg-positive/10 border-positive/30 text-forest';
      case 'error':
        return 'bg-danger/10 border-danger/30 text-forest';
      default:
        return 'bg-surface border-line text-forest';
    }
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
