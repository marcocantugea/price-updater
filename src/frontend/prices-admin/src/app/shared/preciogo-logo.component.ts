import { Component, Input } from '@angular/core';

/**
 * PrecioGo brand lockup.
 *
 * The artwork is inlined rather than loaded through `<img>` on purpose: an external
 * SVG referenced by `<img>` is an isolated document, so `role="img"` and
 * `aria-labelledby` inside the file are ignored and the mark ends up with no
 * accessible name. Inlining keeps the name readable by assistive technology.
 *
 * Geometry is copied verbatim from the approved
 * `docs/branding/assets/preciogo-sidebar.svg` (172 x 44 viewBox) — the compact
 * lockup the brand guide assigns to the current sidebar surface. It is the same
 * lockup the guide allows on "other compact light UI placements", so the login
 * header reuses it at a larger height instead of a second asset.
 *
 * The guide's rule for this surface is explicit: use the compact lockup at
 * 172 x 44 px and do not scale the large horizontal asset down to fit.
 */
@Component({
  selector: 'app-preciogo-logo',
  standalone: true,
  template: `
    <div class="block" [style.height.px]="height">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 172 44"
        preserveAspectRatio="xMinYMid meet"
        class="block h-full w-auto"
        [attr.role]="decorative ? null : 'img'"
        [attr.aria-hidden]="decorative ? 'true' : null"
        [attr.aria-labelledby]="decorative ? null : titleId"
      >
        <title [attr.id]="titleId">PrecioGo</title>
        <g transform="translate(2 2) scale(.072)">
          <path
            d="M 111 328 L 159 283 C 206 329 256 348 306 310 L 405 197 C 427 268 411 326 375 361 C 339 399 283 419 217 411 L 195 486 C 186 524 151 536 86 533 C 74 533 73 521 78 503 Z"
            fill="#C86500"
          />
          <path
            d="M 8 357 C -2 347 -2 331 9 319 L 136 186 C 146 175 158 175 169 184 L 233 234 L 354 112 L 326 87 C 314 77 319 67 334 63 L 486 20 C 500 16 506 23 503 38 L 477 190 C 474 205 463 207 452 197 L 414 160 L 317 266 C 280 309 250 316 210 282 L 158 244 L 48 358 C 34 373 20 371 8 357 Z"
            fill="#5F8467"
          />
          <text x="160" y="184" fill="#3673A2" font-family="Arial, Helvetica, sans-serif" font-size="195" font-weight="700">$</text>
        </g>
        <text x="47" y="31" fill="#080808" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" letter-spacing="-.7">Precio</text>
        <text x="119" y="31" fill="#A34E00" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" letter-spacing="-.7">Go</text>
      </svg>
    </div>
  `,
  host: {
    class: 'inline-block align-middle'
  }
})
export class PrecioGoLogoComponent {
  /** Rendered height in pixels. The 172 x 44 proportion is preserved. */
  @Input() height = 44;

  /**
   * The sidebar keeps a text label for the zone and the login header prints the
   * product descriptor right underneath, so in both placements adjacent text
   * already names the product and the artwork is decorative.
   */
  @Input() decorative = true;

  private readonly uid = `pg-logo-${nextLogoInstanceId()}`;

  get titleId(): string {
    return `${this.uid}-title`;
  }
}

/**
 * Two instances can coexist while the sidebar and the login header mount in the
 * same document, and duplicate ids would break `aria-labelledby`. Angular 19.2
 * has no `uniqueIds` option, so ids are namespaced with a module counter.
 */
let logoInstanceCount = 0;

function nextLogoInstanceId(): number {
  logoInstanceCount += 1;
  return logoInstanceCount;
}
