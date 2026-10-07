import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from './core/i18n/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class AppComponent {
  private readonly language = inject(LanguageService);

  constructor() {
    // Resolves the guest/login locale exactly once, before the first route
    // renders. An authenticated session later overrides it through
    // `SessionStore.setSession`, because the server preference always wins.
    this.language.initialize();
  }
}
