import { AbstractControl, ValidationErrors } from '@angular/forms';
import { Observable } from 'rxjs';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'autocomplete'
  | 'date'
  | 'password'
  | 'checkbox'
  | 'toggle';
export type ColumnType = 'text' | 'status' | 'money' | 'date' | 'boolean' | 'code';

/**
 * Static, translatable copy. Stored as a key (plus optional interpolation
 * parameters) and resolved while rendering, never during construction, so it
 * follows a runtime language switch.
 */
export interface TranslatableText {
  key: string;
  params?: Record<string, unknown>;
}

/** Literal, non-translatable text: API data such as a product or role name. */
export interface LiteralText {
  text: string;
}

/**
 * A display string in declarative configuration.
 *
 * Translatable copy is always a catalog key; API business data is always a
 * literal. There is deliberately NO plain-`string` arm: the compiler now rejects
 * copy that has not been moved to a catalog, which is what keeps the migration
 * from regressing.
 */
export type DisplayText = TranslatableText | LiteralText;

/**
 * Explicit "no text" value, used as the default of optional `DisplayText`
 * inputs. A bare `''` is not assignable any more, which is the point: an input
 * default must state whether it is copy (a key) or literal text.
 */
export const EMPTY_TEXT: LiteralText = { text: '' };

export interface FieldOption {
  value: string;
  label: DisplayText;
}

/** Declarative description of a form control in the create/edit modal. */
export interface FieldConfig {
  key: string;
  label: DisplayText;
  type: FieldType;
  required?: boolean;
  placeholder?: DisplayText;
  help?: DisplayText;
  options?: FieldOption[];
  /** Key into the page `selectSources` map for dynamically loaded options. */
  optionsKey?: string;
  /**
   * Key into the page `asyncSelectSources` map for an `autocomplete` field.
   *
   * Deliberately separate from `optionsKey`: a select source is eager and loads
   * once per page, while an async source is called with the typed term and must
   * stay query-aware.
   */
  asyncOptionsKey?: string;
  /** Minimum typed characters before an async source is queried. */
  minLength?: number;
  /**
   * Label of the current selection in edit mode, derived from the row.
   *
   * The eager `selectSources` cache is loaded once per page and cannot supply a
   * per-row label, so an autocomplete field declares where its existing value's
   * label comes from. It only affects rendering: the form control keeps holding
   * the plain id.
   */
  initialOption?: (row: any) => FieldOption | null;
  /** Renders the field read-only while editing (immutable references). */
  disabledOnEdit?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /**
   * Maximum number of characters. Adds the `maxlength` attribute and the
   * matching validator, so the limit is visible while typing instead of only
   * arriving as a server error. The API stays the final authority.
   */
  maxLength?: number;
  /**
   * Whole numbers only. Rejects a fractional value and, deliberately, does not
   * coerce: a cleared number input must never become a valid `0`.
   */
  integer?: boolean;
  defaultValue?: unknown;
  /** Renders the control only while another control holds this value. */
  visibleWhen?: { key: string; equals: unknown };
  editOnly?: boolean;
  createOnly?: boolean;
  /** Full-width control in the two-column grid. */
  full?: boolean;
}

export interface ColumnConfig {
  key: string;
  label: DisplayText;
  type?: ColumnType;
  /** Format a database calendar date without applying the browser time zone. */
  dateOnly?: boolean;
  /** Column holding the currency code for `money` columns. */
  currencyKey?: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  /**
   * Optional cell renderer, used when the displayed value is not the raw one.
   *
   * The canonical case is a system catalog: the API stores an English `name` for
   * a seeded role, and the UI must show the copy for the row's stable `slug`,
   * falling back to the database value for user-created records.
   */
  value?: (row: any) => DisplayText;
}

export type OptionLoader = () => Observable<FieldOption[]>;
/**
 * Query-aware option source for an `autocomplete` field.
 *
 * It is called with the trimmed term the user typed, and must return the
 * options for that term only — it is never asked for the whole catalog.
 */
export type AsyncOptionLoader = (term: string) => Observable<FieldOption[] | { data: FieldOption[] }>;
export type CrossValidator = (control: AbstractControl) => ValidationErrors | null;

export interface PreviewResult {
  label: DisplayText;
  value: DisplayText;
  hint?: DisplayText;
}

export type PreviewRunner = (values: Record<string, unknown>) => Observable<PreviewResult[]>;

/** Context handed to `mapToPayload` so a page can tailor create vs update. */
export interface PayloadContext {
  isEditing: boolean;
}

export type PayloadMapper = (
  values: Record<string, unknown>,
  context: PayloadContext
) => Record<string, unknown>;

/** Extra per-row action rendered next to Edit/Delete (e.g. revoke, permissions). */
export interface RowAction {
  label: DisplayText;
  run: (row: any) => void;
  tone?: 'default' | 'danger';
  visible?: (row: any) => boolean;
}

/**
 * Per-page overrides for the CRUD chrome.
 *
 * The component ships complete, self-contained sentences with a sensible default
 * per action. A page whose copy does not fit the generic wording replaces the
 * whole sentence here — never a fragment — so the translator keeps control of
 * word order, gender and number. `{{entity}}` is interpolated for the defaults.
 */
export interface CrudMessages {
  /** Button label and modal title when creating. */
  create?: DisplayText;
  /** Modal title when editing an existing record. */
  edit?: DisplayText;
  loading?: DisplayText;
  emptyTitle?: DisplayText;
  created?: DisplayText;
  updated?: DisplayText;
  deleted?: DisplayText;
  deleteTitle?: DisplayText;
  deleteMessage?: DisplayText;
  /** Shown when the server rejects the form as a whole. */
  invalidForm?: DisplayText;
}
