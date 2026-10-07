import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { ApiErrorDetail, ApiErrorResponse } from '../models';

/** Catalog namespace holding one key per stable API error code. */
export const ERROR_KEY_PREFIX = 'errors.';

/** Key used when nothing else can be resolved. */
export const UNEXPECTED_ERROR_KEY = 'errors.unexpected';

/**
 * Messages that must never reach the user even when the API sends them: they
 * leak internals (driver names, connection strings, stack frames) and are
 * English prose. They are replaced by the localized generic error.
 */
const UNSAFE_MESSAGE_PATTERNS: readonly RegExp[] = [
  /Prisma/i,
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/,
  /at\s+\w+\s+\(.*:\d+:\d+\)/,
  /Invalid `prisma\./i,
  /^\s*at\s/m
];

const MAX_SAFE_MESSAGE_LENGTH = 300;

export interface ErrorMessageOptions {
  /** Catalog key used when nothing else resolves. Defaults to `errors.unexpected`. */
  fallbackKey?: string;
  /** Parameters for that fallback key. */
  params?: Record<string, unknown>;
}

/**
 * Single place where an API error becomes user-visible copy.
 *
 * Resolution order (§3.6 of the plan):
 *
 *   errors.<API_CODE> -> localized message with parameters -> API message -> fallback key
 *
 * The API never chooses a presentation language; it only exposes stable codes
 * plus a technical fallback message.
 */
@Injectable({ providedIn: 'root' })
export class ApiErrorLocalizerService {
  private readonly transloco = inject(TranslocoService);

  /** Localized message for a failed request or a raw error object. */
  message(error: unknown, options: ErrorMessageOptions = {}): string {
    const envelope = this.envelopeOf(error);
    const fallbackKey = options.fallbackKey ?? UNEXPECTED_ERROR_KEY;

    if (envelope) {
      const localized = this.fromCode(envelope.code, undefined);
      if (localized) return localized;
      if (this.isSafe(envelope.message)) return envelope.message.trim();
    }

    // A thrown Error from our own code is still useful. `HttpErrorResponse` is
    // excluded on purpose: its `message` is Angular's English transport prose
    // ("Http failure response for ..."), which must never reach the user.
    if (
      !envelope &&
      error instanceof Error &&
      !(error instanceof HttpErrorResponse) &&
      this.isSafe(error.message)
    ) {
      return error.message.trim();
    }

    return (
      this.translateKey(fallbackKey, this.sanitizeParams(options.params)) ??
      this.translateKey(UNEXPECTED_ERROR_KEY) ??
      fallbackKey
    );
  }

  /**
   * Field -> localized message map for Reactive Forms. Prefers the stable
   * detail code, then the API prose, and always keeps `field` so the form can
   * bind the message to the right control.
   */
  fieldErrors(error: unknown): Record<string, string> {
    const details = this.envelopeOf(error)?.details;
    const result: Record<string, string> = {};
    if (!Array.isArray(details)) return result;

    for (const detail of details) {
      if (!detail || typeof detail.field !== 'string' || detail.field === '') continue;
      if (result[detail.field]) continue;
      result[detail.field] = this.detail(detail);
    }

    return result;
  }

  /** Localizes one envelope detail, falling back to its technical message. */
  detail(detail: ApiErrorDetail | null | undefined): string {
    if (!detail) return this.translateKey(UNEXPECTED_ERROR_KEY) ?? UNEXPECTED_ERROR_KEY;

    const localized = this.fromCode(detail.code, detail.params);
    if (localized) return localized;
    if (this.isSafe(detail.message)) return detail.message.trim();

    return this.translateKey(UNEXPECTED_ERROR_KEY) ?? UNEXPECTED_ERROR_KEY;
  }

  // --- internals -----------------------------------------------------------

  /** Resolves `errors.<code>`; returns null when the catalog has no such key. */
  private fromCode(code: unknown, params: Record<string, unknown> | undefined): string | null {
    if (typeof code !== 'string' || code.trim() === '') return null;

    const key = `${ERROR_KEY_PREFIX}${code}`;
    // Unknown parameters would render as raw `{{ placeholders }}`, so only
    // string/number values are forwarded.
    return this.translateKey(key, this.sanitizeParams(params));
  }

  private translateKey(key: string, params?: Record<string, string | number>): string | null {
    try {
      const translated = this.transloco.translate(key, params ?? {});
      if (typeof translated !== 'string') return null;

      // A parameter the caller could not supply would otherwise render as raw
      // `{{ placeholder }}` text, so leftover placeholders are stripped.
      const value = translated
        .replace(/\{\{\s*[^{}]*\s*\}\}/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Transloco's missing handler returns the key itself.
      if (value === '' || value === key) return null;
      return value;
    } catch {
      return null;
    }
  }

  private sanitizeParams(params: Record<string, unknown> | undefined): Record<string, string | number> {
    const result: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      if (typeof value === 'string' || typeof value === 'number') {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) => String(item)).join(', ');
      }
    }
    return result;
  }

  private envelopeOf(error: unknown): ApiErrorResponse | null {
    const payload = (error as { error?: unknown } | null | undefined)?.error;
    if (!payload || typeof payload !== 'object') return null;
    return payload as ApiErrorResponse;
  }

  private isSafe(message: unknown): message is string {
    if (typeof message !== 'string') return false;
    const value = message.trim();
    if (value === '' || value.length > MAX_SAFE_MESSAGE_LENGTH) return false;
    return !UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(value));
  }
}
