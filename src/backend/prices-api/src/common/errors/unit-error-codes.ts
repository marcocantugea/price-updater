/**
 * Stable, localizable error codes of the unit-of-measure feature (TEC-43).
 *
 * They live in one place because two services and the HTTP validators produce
 * them: the global catalog service (administrative rules on a unit) and the
 * product-specification service (rules on a captured value). The frontend
 * resolves each one through the `errors.<CODE>` catalog key, so the code — not
 * the message — is the contract.
 */

/** 409: a live row already owns this unit `code`. */
export const UNIT_CODE_TAKEN = 'UNIT_CODE_TAKEN';

/** 422: `code` is immutable once the unit exists. */
export const UNIT_CODE_IMMUTABLE = 'UNIT_CODE_IMMUTABLE';

/** 422: `code` violates the documented pattern (see the UOM validators). */
export const UNIT_CODE_FORMAT = 'UNIT_CODE_FORMAT';

/** 422: the dimension cannot change while stored records reference the unit. */
export const UNIT_DIMENSION_LOCKED = 'UNIT_DIMENSION_LOCKED';

/**
 * 422: the requested `decimals` cannot represent values already captured, or a
 * submitted value uses more decimals than its unit allows.
 */
export const UNIT_PRECISION_EXCEEDED = 'UNIT_PRECISION_EXCEEDED';

/**
 * 422: the selected unit is unknown, inactive or soft-deleted and is not being
 * retained by the record that already used it.
 */
export const UNIT_NOT_AVAILABLE = 'UNIT_NOT_AVAILABLE';

/** 422: a PATCH carried no field at all. */
export const EMPTY_UPDATE_BODY = 'EMPTY_UPDATE_BODY';
