import { Component, inject } from '@angular/core';
import { CrudPageComponent } from '../../shared/crud-page.component';
import { UnitOfMeasureService } from '../../core/services/catalog.services';
import { SessionStore } from '../../core/services/session.store';
import { recordStatusOptions, unitDimensionOptions } from '../../core/utils/options';
import type { ColumnConfig, FieldConfig, PayloadMapper } from '../../shared/crud-page.types';

/**
 * Global unit-of-measure administration (TEC-43).
 *
 * A global catalog is not an ordinary CRUD screen, and two behaviours of the
 * shared form matter here:
 *
 * - **Code is immutable.** It is the value every business table references by
 *   foreign key, so the control is disabled while editing and the mapper omits
 *   it from the PATCH body. The API refuses a change on its own, so this is
 *   convenience, not enforcement.
 * - **Decimals must not default silently.** A cleared number input reaches the
 *   form as `null`, and `Number(null)` is `0`: coercing it would tighten the
 *   unit and invalidate stored values. The field is required and whole-number
 *   only, and the mapper never converts an empty value into `0`.
 *
 * `dimension` is protected server-side once the unit is referenced, and
 * lowering `decimals` is refused while stored values need more precision.
 */
@Component({
  selector: 'app-units-of-measure',
  standalone: true,
  imports: [CrudPageComponent],
  template: `
    <app-crud-page
      [title]="{ key: 'unitsOfMeasure.title' }"
      [subtitle]="{ key: 'unitsOfMeasure.subtitle' }"
      [entityLabel]="{ key: 'unitsOfMeasure.entity' }"
      [searchPlaceholder]="{ key: 'unitsOfMeasure.searchPlaceholder' }"
      [emptyMessage]="{ key: 'unitsOfMeasure.emptyMessage' }"
      [messages]="messages"
      [columns]="columns"
      [fields]="fields"
      [service]="service"
      [mapToPayload]="mapToPayload"
      [canCreate]="can('units-of-measure:create')"
      [canEdit]="can('units-of-measure:update')"
      [canDelete]="can('units-of-measure:delete')"
    />
  `
})
export class UnitsOfMeasureComponent {
  readonly service = inject(UnitOfMeasureService);
  private readonly session = inject(SessionStore);

  /**
   * The generic toasts speak about "one record". Here the consequence is
   * company-wide, so the whole sentence is replaced rather than patched.
   */
  readonly messages = {
    created: { key: 'unitsOfMeasure.messages.created' },
    updated: { key: 'unitsOfMeasure.messages.updated' },
    deleted: { key: 'unitsOfMeasure.messages.deleted' },
    deleteTitle: { key: 'unitsOfMeasure.messages.deleteTitle' },
    deleteMessage: { key: 'unitsOfMeasure.messages.deleteMessage' }
  };

  readonly columns: ColumnConfig[] = [
    { key: 'code', label: { key: 'common.code' }, type: 'code', sortable: true },
    { key: 'name', label: { key: 'common.name' } },
    { key: 'symbol', label: { key: 'unitsOfMeasure.columns.symbol' } },
    {
      key: 'dimension',
      label: { key: 'unitsOfMeasure.columns.dimension' },
      // The database stores `count|mass|length`; the UI translates by code.
      value: (row) => ({ key: `unitDimension.${row.dimension}` })
    },
    { key: 'decimals', label: { key: 'unitsOfMeasure.columns.decimals' }, align: 'right' },
    { key: 'status', label: { key: 'common.status' }, type: 'status' }
  ];

  readonly fields: FieldConfig[] = [
    {
      key: 'code',
      label: { key: 'common.code' },
      type: 'text',
      required: true,
      maxLength: 8,
      disabledOnEdit: true,
      placeholder: { key: 'unitsOfMeasure.fields.codePlaceholder' },
      help: { key: 'unitsOfMeasure.fields.codeHelp' }
    },
    {
      key: 'name',
      label: { key: 'common.name' },
      type: 'text',
      required: true,
      maxLength: 100,
      placeholder: { key: 'unitsOfMeasure.fields.namePlaceholder' }
    },
    {
      key: 'symbol',
      label: { key: 'unitsOfMeasure.columns.symbol' },
      type: 'text',
      required: true,
      maxLength: 10,
      placeholder: { key: 'unitsOfMeasure.fields.symbolPlaceholder' }
    },
    {
      key: 'dimension',
      label: { key: 'unitsOfMeasure.columns.dimension' },
      type: 'select',
      required: true,
      options: unitDimensionOptions(),
      help: { key: 'unitsOfMeasure.fields.dimensionHelp' }
    },
    {
      key: 'decimals',
      label: { key: 'unitsOfMeasure.columns.decimals' },
      type: 'number',
      required: true,
      integer: true,
      min: 0,
      max: 3,
      step: 1,
      defaultValue: 0,
      help: { key: 'unitsOfMeasure.fields.decimalsHelp' }
    },
    {
      key: 'status',
      label: { key: 'common.status' },
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: recordStatusOptions()
    }
  ];

  readonly mapToPayload: PayloadMapper = (values, context) => {
    const payload: Record<string, unknown> = { ...values };

    // Immutable reference: `getRawValue()` still carries the disabled control,
    // so it is dropped rather than resent.
    if (context.isEditing) delete payload['code'];

    // `null` (cleared input) and `''` are left untouched: sending `undefined`
    // keeps the field out of the body instead of turning it into a zero.
    const decimals = values['decimals'];
    payload['decimals'] =
      decimals === null || decimals === undefined || decimals === '' ? undefined : Number(decimals);

    return payload;
  };

  can(permission: string): boolean {
    return this.session.hasPermission(permission);
  }
}
