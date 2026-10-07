import { Component, computed, input } from '@angular/core';
import { StatusLabelPipe } from '../core/pipes/status-label.pipe';

const TONES: Record<string, string> = {
  active: 'bg-positive/10 text-positive border-positive/20',
  inactive: 'bg-olive/10 text-olive border-olive/20',
  revoked: 'bg-danger/10 text-danger border-danger/20',
  expired: 'bg-contrast/10 text-contrast border-contrast/20'
};

/** Coloured pill for record statuses (Activo, Inactivo, Vigente, Expirado...). */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [StatusLabelPipe],
  template: `
    <span
      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
      [class]="tone()"
      data-testid="status-badge"
    >
      {{ value() | statusLabel }}
    </span>
  `
})
export class StatusBadgeComponent {
  readonly value = input<string | null | undefined>(null);

  readonly tone = computed(() => TONES[this.value() ?? ''] ?? 'bg-sidebar text-olive border-line');
}
