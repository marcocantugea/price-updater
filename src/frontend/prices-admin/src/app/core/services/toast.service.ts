import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

let sequence = 0;

/** Minimal in-memory toast queue used for success/error feedback. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSignal = signal<Toast[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  show(message: string, kind: ToastKind = 'info', timeoutMs = 4000): number {
    const id = ++sequence;
    this.toastsSignal.update((current) => [...current, { id, kind, message }]);

    if (timeoutMs > 0) {
      setTimeout(() => this.dismiss(id), timeoutMs);
    }
    return id;
  }

  success(message: string): number {
    return this.show(message, 'success');
  }

  error(message: string): number {
    return this.show(message, 'error', 6000);
  }

  info(message: string): number {
    return this.show(message, 'info');
  }

  dismiss(id: number): void {
    this.toastsSignal.update((current) => current.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.toastsSignal.set([]);
  }
}
