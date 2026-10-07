import type { ActorContext } from '../../types';

/** Audit columns to persist on INSERT. */
export function auditCreateFields(actor: ActorContext) {
  return {
    createdBy: actor.id,
    createdByType: actor.type,
    updatedBy: actor.id,
    updatedByType: actor.type
  };
}

/** Audit columns to persist on UPDATE. */
export function auditUpdateFields(actor: ActorContext) {
  return {
    updatedBy: actor.id,
    updatedByType: actor.type
  };
}

/** Audit columns for a soft delete. */
export function auditDeleteFields(actor: ActorContext) {
  return {
    deletedAt: new Date(),
    updatedBy: actor.id,
    updatedByType: actor.type
  };
}
