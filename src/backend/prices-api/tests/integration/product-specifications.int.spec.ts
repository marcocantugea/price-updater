import { randomUUID } from 'node:crypto';
import { runSeeds } from '../../prisma/seed/index';
import { MODEL_OPTIONS } from '../../src/repositories/model-options';
import { TenantCrudRepository } from '../../src/common/crud/repository';
import { toPlain } from '../../src/common/utils/serialize';
import { ProductSpecificationService } from '../../src/services/product-specification.service';
import {
  closeTestPrisma,
  createBrand,
  createIsolatedTenant,
  createProduct,
  createSupplier,
  deleteIsolatedTenant,
  deleteSupplier,
  rejectedStatement,
  testPrisma
} from './helpers/test-database';

const ACTOR = { id: null, type: 'system' as const };

/**
 * Integration suite: the schema and the aggregate service against real MySQL.
 *
 * It exists for the claims a hand-written double cannot settle:
 *
 * - the composite foreign keys really do reject cross-tenant references;
 * - the CHECK constraints really do reject negative and half-filled values;
 * - `@@unique([tenantId, normalizedValue])` really covers soft-deleted rows, so
 *   a barcode is never released;
 * - a multi-statement write really does roll back.
 *
 * Every statement that is supposed to fail asserts *which* constraint rejected it.
 * "Something threw" would also pass for a typo in the SQL, which is how a
 * constraint test silently becomes a test of nothing.
 */
describe('product specifications against MySQL', () => {
  const prisma = testPrisma();
  let tenantId: string;

  beforeEach(async () => {
    tenantId = await createIsolatedTenant(prisma, 'specs');
  });

  afterEach(async () => {
    await deleteIsolatedTenant(prisma, tenantId);
  });

  afterAll(async () => {
    await closeTestPrisma();
  });

  // --- the schema as the database actually holds it ------------------------

  describe('applied schema', () => {
    it('creates the seven tables of the aggregate', async () => {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT table_name AS name FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name IN ('unit_of_measures','brands','suppliers','product_specifications',
                               'product_presentations','product_identifiers','product_suppliers')`
      );

      expect(rows.map((row) => row.name).sort()).toEqual([
        'brands',
        'product_identifiers',
        'product_presentations',
        'product_specifications',
        'product_suppliers',
        'suppliers',
        'unit_of_measures'
      ]);
    });

    it('keeps every CHECK constraint, even though Prisma cannot see them', async () => {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT constraint_name AS name FROM information_schema.table_constraints
          WHERE constraint_schema = DATABASE() AND constraint_type = 'CHECK'`
      );

      const names = rows.map((row) => row.name);

      for (const expected of [
        'product_specifications_weight_positive',
        'product_specifications_length_positive',
        'product_specifications_depth_positive',
        'product_specifications_weight_unit_pair',
        'product_specifications_length_unit_pair',
        'product_specifications_depth_unit_pair',
        'product_presentations_quantity_positive'
      ]) {
        expect(names).toContain(expected);
      }
    });

    it('makes the normalized barcode unique per tenant', async () => {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT column_name AS name, non_unique AS nonUnique, seq_in_index AS position
           FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = 'product_identifiers'
            AND index_name = 'product_identifiers_tenant_id_normalized_value_key'
          ORDER BY seq_in_index`
      );

      expect(rows.map((row) => row.name)).toEqual(['tenant_id', 'normalized_value']);
      expect(rows.every((row) => Number(row.nonUnique) === 0)).toBe(true);
    });
  });

  // --- what the engine refuses --------------------------------------------

  describe('constraint enforcement', () => {
    function specificationInsert(overrides: Record<string, unknown> = {}): [string, unknown[]] {
      const row = {
        id: randomUUID(),
        tenantId,
        productId: productId,
        weight: null,
        weightUnitCode: null,
        ...overrides
      } as any;

      return [
        `INSERT INTO product_specifications
           (id, tenant_id, product_id, brand_id, model, weight, weight_unit_code,
            length, length_unit_code, depth, depth_unit_code, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, 'active', NOW(3), NOW(3))`,
        [row.id, row.tenantId, row.productId, row.brandId ?? null, row.weight, row.weightUnitCode]
      ];
    }

    let productId: string;

    beforeEach(async () => {
      productId = await createProduct(prisma, tenantId, `SKU-${randomUUID().slice(0, 8)}`);
    });

    it('rejects a negative measurement', async () => {
      const [sql, params] = specificationInsert({ weight: -1, weightUnitCode: 'KG' });
      const message = await rejectedStatement(prisma, sql, params);

      expect(message).toContain('product_specifications_weight_positive');
    });

    it('rejects a value without a unit', async () => {
      const [sql, params] = specificationInsert({ weight: 1.5, weightUnitCode: null });
      const message = await rejectedStatement(prisma, sql, params);

      expect(message).toContain('product_specifications_weight_unit_pair');
    });

    it('rejects a unit without a value', async () => {
      const [sql, params] = specificationInsert({ weight: null, weightUnitCode: 'KG' });
      const message = await rejectedStatement(prisma, sql, params);

      expect(message).toContain('product_specifications_weight_unit_pair');
    });

    it('rejects a zero quantity on a presentation', async () => {
      const message = await rejectedStatement(
        prisma,
        `INSERT INTO product_presentations
           (id, tenant_id, product_id, name, quantity, unit_code, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Zero', 0, 'EA', 'active', NOW(3), NOW(3))`,
        [randomUUID(), tenantId, productId]
      );

      expect(message).toContain('product_presentations_quantity_positive');
    });

    it('rejects a brand that belongs to another tenant', async () => {
      const otherTenant = await createIsolatedTenant(prisma, 'other');
      const foreignBrand = await createBrand(prisma, otherTenant, 'Foreign');

      try {
        const [sql, params] = specificationInsert({ brandId: foreignBrand });
        const message = await rejectedStatement(prisma, sql, params);

        // The composite key (tenant_id, brand_id) is what makes this impossible,
        // not the service check.
        expect(message).toContain('product_specifications_tenant_id_brand_id_fkey');
      } finally {
        await deleteIsolatedTenant(prisma, otherTenant);
      }
    });

    it('rejects a product that belongs to another tenant', async () => {
      const otherTenant = await createIsolatedTenant(prisma, 'other');
      const foreignProduct = await createProduct(prisma, otherTenant, 'FOREIGN-1');

      try {
        const message = await rejectedStatement(
          prisma,
          `INSERT INTO product_specifications
             (id, tenant_id, product_id, status, created_at, updated_at)
           VALUES (?, ?, ?, 'active', NOW(3), NOW(3))`,
          [randomUUID(), tenantId, foreignProduct]
        );

        expect(message).toContain('product_specifications_tenant_id_product_id_fkey');
      } finally {
        await deleteIsolatedTenant(prisma, otherTenant);
      }
    });

    it('never releases a barcode, not even after the owning row is soft-deleted', async () => {
      const presentationId = randomUUID();
      await prisma.productPresentation.create({
        data: {
          id: presentationId,
          tenantId,
          productId,
          name: 'Caja',
          quantity: 1,
          unitCode: 'EA',
          status: 'active',
          createdByType: 'system',
          updatedByType: 'system'
        }
      });

      await prisma.productIdentifier.create({
        data: {
          tenantId,
          productId,
          presentationId,
          type: 'ean_13',
          value: '7501234567893',
          normalizedValue: '07501234567893',
          status: 'active',
          createdByType: 'system',
          updatedByType: 'system'
        }
      });

      // Soft-delete the owner, exactly as the aggregate DELETE does.
      await prisma.productIdentifier.updateMany({
        where: { tenantId, presentationId },
        data: { deletedAt: new Date(), status: 'inactive' }
      });

      const message = await rejectedStatement(
        prisma,
        `INSERT INTO product_identifiers
           (id, tenant_id, product_id, presentation_id, type, value, normalized_value,
            status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ean_13', '7501234567893', '07501234567893', 'active', NOW(3), NOW(3))`,
        [randomUUID(), tenantId, productId, presentationId]
      );

      // A partial index cannot express this; MySQL has none, so the plain unique
      // key covers deleted rows too — which is what the contract wants.
      expect(message).toContain('product_identifiers_tenant_id_normalized_value_key');
    });

    it('rolls back every statement of a failed transaction', async () => {
      const productId2 = await createProduct(prisma, tenantId, `SKU-${randomUUID().slice(0, 8)}`);

      await expect(
        prisma.$transaction(async (tx: any) => {
          // First write succeeds...
          await tx.productPresentation.create({
            data: {
              tenantId,
              productId: productId2,
              name: 'Will be rolled back',
              quantity: 1,
              unitCode: 'EA',
              status: 'active'
            }
          });

          // ...then a CHECK violation aborts the transaction.
          await tx.$executeRawUnsafe(
            `INSERT INTO product_presentations
               (id, tenant_id, product_id, name, quantity, unit_code, status, created_at, updated_at)
             VALUES (?, ?, ?, 'Bad', 0, 'EA', 'active', NOW(3), NOW(3))`,
            randomUUID(),
            tenantId,
            productId2
          );
        })
      ).rejects.toThrow();

      // This is the property the aggregate PUT depends on: no partial aggregate.
      expect(await prisma.productPresentation.count({ where: { tenantId, productId: productId2 } })).toBe(0);
    });
  });

  // --- the service, against the real engine -------------------------------

  describe('the aggregate service', () => {
    let productId: string;
    let brandId: string;
    let supplierId: string;
    let service: ProductSpecificationService;

    beforeEach(async () => {
      productId = await createProduct(prisma, tenantId, `SKU-${randomUUID().slice(0, 8)}`);
      brandId = await createBrand(prisma, tenantId, `Brand ${randomUUID().slice(0, 6)}`);
      // The supplier belongs to the global catalog, so it is not part of the
      // tenant cleanup and gets its own unique name.
      supplierId = await createSupplier(prisma, `Supplier ${randomUUID().slice(0, 8)}`);

      // The real repository and the real client, wired the way the container
      // wires them.
      service = new ProductSpecificationService(
        prisma,
        new TenantCrudRepository(prisma, MODEL_OPTIONS.product)
      );
    });

    afterEach(async () => {
      await deleteSupplier(prisma, supplierId);
    });

    function payload(overrides: Record<string, unknown> = {}): any {
      return {
        brandId,
        model: 'IT-1',
        measurements: { weight: { value: 1.25, unitCode: 'KG' }, length: null, depth: null },
        presentations: [
          {
            name: 'Caja de 12',
            quantity: 12,
            unitCode: 'EA',
            identifiers: [{ type: 'ean_13', value: '7501234567893' }]
          }
        ],
        supplierIds: [supplierId],
        ...overrides
      };
    }

    it('creates and reads back the whole aggregate', async () => {
      await service.replaceAggregate(tenantId, productId, payload(), ACTOR);

      const aggregate: any = await service.getAggregate(tenantId, productId);

      expect(aggregate.specification).toMatchObject({ model: 'IT-1', brandId });

      // The service hands back the driver's `Decimal`, because `DECIMAL` columns
      // do not arrive as JavaScript numbers. Asserting this explicitly is what
      // stops the next test from being surprised by it.
      expect(aggregate.specification.measurements.weight.unitCode).toBe('KG');
      expect(String(aggregate.specification.measurements.weight.value)).toBe('1.25');

      // ...and this is what the HTTP layer actually sends, because the controller
      // runs the result through `toPlain`. §8 of the plan specifies numbers, so
      // the contract only holds at that boundary — which is exactly why the
      // service must not be tested as if it were the response.
      const plain: any = toPlain(aggregate);

      expect(plain.specification.measurements.weight).toEqual({ value: 1.25, unitCode: 'KG' });
      expect(typeof plain.specification.measurements.weight.value).toBe('number');
      expect(plain.presentations[0].quantity).toBe(12);
      expect(typeof plain.presentations[0].quantity).toBe('number');
      expect(plain.presentations).toHaveLength(1);
      expect(plain.presentations[0].identifiers[0].normalizedValue).toBe('07501234567893');
      expect(plain.suppliers).toEqual([{ id: supplierId, name: expect.any(String) }]);
    });

    it('soft-deletes an omitted presentation and its identifiers', async () => {
      await service.replaceAggregate(tenantId, productId, payload(), ACTOR);
      const created = await service.getAggregate(tenantId, productId);
      const dropped = created.presentations[0];

      await service.replaceAggregate(
        tenantId,
        productId,
        payload({ presentations: [] }),
        ACTOR
      );

      const stored = await prisma.productPresentation.findFirst({ where: { id: dropped.id } });
      expect(stored).not.toBeNull();
      expect(stored!.deletedAt).toBeInstanceOf(Date);

      const identifiers = await prisma.productIdentifier.findMany({
        where: { presentationId: dropped.id }
      });
      expect(identifiers.every((row) => row.deletedAt instanceof Date)).toBe(true);
    });

    it('revives a soft-deleted presentation when its id comes back', async () => {
      await service.replaceAggregate(tenantId, productId, payload(), ACTOR);
      const created = await service.getAggregate(tenantId, productId);
      const target = created.presentations[0];

      await service.replaceAggregate(tenantId, productId, payload({ presentations: [] }), ACTOR);
      await service.replaceAggregate(
        tenantId,
        productId,
        payload({
          presentations: [
            {
              id: target.id,
              name: target.name,
              quantity: target.quantity,
              unitCode: target.unitCode,
              identifiers: target.identifiers.map((identifier: any) => ({
                id: identifier.id,
                type: identifier.type,
                value: identifier.value
              }))
            }
          ]
        }),
        ACTOR
      );

      const revived = await prisma.productPresentation.findFirst({ where: { id: target.id } });
      expect(revived).not.toBeNull();
      expect(revived!.deletedAt).toBeNull();

      const aggregate = await service.getAggregate(tenantId, productId);
      expect(aggregate.presentations).toHaveLength(1);
      expect(aggregate.presentations[0].id).toBe(target.id);
    });

    it('reports a barcode already used by another product as a 409', async () => {
      const otherProduct = await createProduct(prisma, tenantId, `SKU-${randomUUID().slice(0, 8)}`);
      await service.replaceAggregate(tenantId, productId, payload(), ACTOR);

      // This is the case the in-memory double could not catch: the clash is on a
      // row belonging to a different product of the same tenant, so only a real
      // tenant-wide lookup (or the database) can see it.
      let failure: any = null;
      try {
        await service.replaceAggregate(tenantId, otherProduct, payload(), ACTOR);
      } catch (error) {
        failure = error;
      }

      expect(failure).not.toBeNull();
      expect(failure.code).toBe('IDENTIFIER_ALREADY_EXISTS');
      expect(failure.statusCode).toBe(409);
      expect(failure.details[0].field).toBe('presentations.0.identifiers.0.value');
    });

    it('rejects a cross-tenant brand through the service as well as the database', async () => {
      const otherTenant = await createIsolatedTenant(prisma, 'other');
      const foreignBrand = await createBrand(prisma, otherTenant, 'Foreign');

      try {
        let failure: any = null;
        try {
          await service.replaceAggregate(tenantId, productId, payload({ brandId: foreignBrand }), ACTOR);
        } catch (error) {
          failure = error;
        }

        expect(failure?.code).toBe('VALIDATION_ERROR');
        expect(failure?.details[0].field).toBe('brandId');
        // And nothing was written.
        expect(await prisma.productSpecification.count({ where: { tenantId, productId } })).toBe(0);
      } finally {
        await deleteIsolatedTenant(prisma, otherTenant);
      }
    });

    it('clears the aggregate without touching the product', async () => {
      await service.replaceAggregate(tenantId, productId, payload(), ACTOR);
      await service.removeAggregate(tenantId, productId, ACTOR);

      const aggregate = await service.getAggregate(tenantId, productId);
      expect(aggregate.specification).toBeNull();
      expect(aggregate.presentations).toEqual([]);

      const product = await prisma.product.findFirst({ where: { id: productId } });
      expect(product).not.toBeNull();
      expect(product!.deletedAt).toBeNull();
    });

    // --- unit and supplier availability against the real catalog -----------

    /**
     * The reference queries behind these rules (`OR` across the three unit
     * columns, and "does anything reference this code") are exactly the kind a
     * double can answer incorrectly, so they are exercised against MySQL.
     */
    describe('unit and supplier availability', () => {
      /** Deactivates a seeded unit for the duration of one test. */
      async function withDeactivatedUnit<T>(code: string, run: () => Promise<T>): Promise<T> {
        const before = await prisma.unitOfMeasure.findFirst({ where: { code } });
        await prisma.unitOfMeasure.update({ where: { code }, data: { status: 'inactive' } });
        try {
          return await run();
        } finally {
          await prisma.unitOfMeasure.update({
            where: { code },
            data: { status: before?.status ?? 'active', deletedAt: before?.deletedAt ?? null }
          });
        }
      }

      it('keeps a deactivated unit on the measurement that already stores it', async () => {
        await service.replaceAggregate(tenantId, productId, payload(), ACTOR);

        await withDeactivatedUnit('KG', async () => {
          // Re-submitting the stored value must not detach the unit.
          await service.replaceAggregate(
            tenantId,
            productId,
            payload({
              presentations: [],
              supplierIds: [],
              measurements: { weight: { value: 1.25, unitCode: 'KG' }, length: null, depth: null }
            }),
            ACTOR
          );
        });

        const stored = await prisma.productSpecification.findFirst({ where: { tenantId, productId } });
        expect(stored!.weightUnitCode).toBe('KG');
      });

      it('rejects a new assignment of a deactivated unit', async () => {
        await withDeactivatedUnit('KG', async () => {
          let failure: any = null;
          try {
            await service.replaceAggregate(
              tenantId,
              productId,
              payload({ measurements: { weight: { value: 1, unitCode: 'KG' }, length: null, depth: null } }),
              ACTOR
            );
          } catch (error) {
            failure = error;
          }

          expect(failure?.code).toBe('UNIT_NOT_AVAILABLE');
          expect(failure?.details[0].field).toBe('measurements.weight.unitCode');
        });
      });

      it('rejects half a unit when the unit allows no decimals', async () => {
        let failure: any = null;
        try {
          await service.replaceAggregate(
            tenantId,
            productId,
            payload({
              measurements: { weight: null, length: null, depth: null },
              presentations: [{ name: 'Media', quantity: 1.5, unitCode: 'EA', identifiers: [] }],
              supplierIds: []
            }),
            ACTOR
          );
        } catch (error) {
          failure = error;
        }

        // `EA` is `count` with `decimals: 0`; the column would have accepted
        // 1.500 silently, which is why the rule lives in the service.
        expect(failure?.code).toBe('UNIT_PRECISION_EXCEEDED');
        expect(failure?.details[0].field).toBe('presentations.0.quantity');
        expect(await prisma.productPresentation.count({ where: { tenantId, productId } })).toBe(0);
      });

      it('accepts a scale the unit can express', async () => {
        await service.replaceAggregate(tenantId, productId, payload(), ACTOR);

        const stored = await prisma.productPresentation.findFirst({ where: { tenantId, productId } });
        expect(String(stored!.quantity)).toBe('12');
        expect(stored!.unitCode).toBe('EA');
      });

      it('keeps a live supplier link when the supplier was deactivated afterwards', async () => {
        await service.replaceAggregate(tenantId, productId, payload(), ACTOR);
        await prisma.supplier.update({ where: { id: supplierId }, data: { status: 'inactive' } });

        try {
          // Presentations are dropped so the re-submission does not attempt to
          // re-insert the same barcode, which is unique across deleted rows: this
          // case is about the supplier link, not about identifiers.
          await service.replaceAggregate(tenantId, productId, payload({ presentations: [] }), ACTOR);

          const links = await prisma.productSupplier.findMany({
            where: { tenantId, productId, deletedAt: null }
          });
          expect(links.map((link) => link.supplierId)).toEqual([supplierId]);
        } finally {
          await prisma.supplier.update({ where: { id: supplierId }, data: { status: 'active' } });
        }
      });

      it('lets two companies link the same global supplier', async () => {
        const otherTenant = await createIsolatedTenant(prisma, 'shared-supplier');
        const otherProduct = await createProduct(prisma, otherTenant, `SKU-${randomUUID().slice(0, 8)}`);
        const otherService = new ProductSpecificationService(
          prisma,
          new TenantCrudRepository(prisma, MODEL_OPTIONS.product)
        );

        try {
          await service.replaceAggregate(tenantId, productId, payload(), ACTOR);
          await otherService.replaceAggregate(
            otherTenant,
            otherProduct,
            {
              brandId: null,
              model: null,
              measurements: {},
              presentations: [],
              supplierIds: [supplierId]
            },
            ACTOR
          );

          // One catalog row, two tenant-owned links. This is what the global
          // catalog buys, and what the single-column foreign key had to allow.
          const links = await prisma.productSupplier.findMany({
            where: { supplierId, deletedAt: null }
          });
          expect(links.map((link) => link.tenantId).sort()).toEqual([tenantId, otherTenant].sort());
        } finally {
          await deleteIsolatedTenant(prisma, otherTenant);
        }
      });

      it('does not let a soft-deleted link authorize a deactivated supplier', async () => {
        await service.replaceAggregate(tenantId, productId, payload(), ACTOR);
        await prisma.productSupplier.updateMany({
          where: { tenantId, productId, supplierId },
          data: { status: 'inactive', deletedAt: new Date() }
        });
        await prisma.supplier.update({ where: { id: supplierId }, data: { status: 'inactive' } });

        try {
          let failure: any = null;
          try {
            await service.replaceAggregate(tenantId, productId, payload(), ACTOR);
          } catch (error) {
            failure = error;
          }

          expect(failure?.details[0].field).toBe('supplierIds');
        } finally {
          await prisma.supplier.update({ where: { id: supplierId }, data: { status: 'active' } });
        }
      });
    });
  });

  // --- seeds and existing products ----------------------------------------

  describe('seeds', () => {
    it('is idempotent against a real database', async () => {
      const counts = async () => ({
        unitOfMeasure: await prisma.unitOfMeasure.count(),
        brand: await prisma.brand.count(),
        supplier: await prisma.supplier.count(),
        productSpecification: await prisma.productSpecification.count(),
        productPresentation: await prisma.productPresentation.count(),
        productIdentifier: await prisma.productIdentifier.count(),
        productSupplier: await prisma.productSupplier.count()
      });

      await runSeeds(prisma, { allowDemo: true });
      const first = await counts();
      await runSeeds(prisma, { allowDemo: true });

      expect(await counts()).toEqual(first);
      expect(first.unitOfMeasure).toBeGreaterThanOrEqual(10);
    });

    it('leaves a product without a specification readable as an empty aggregate', async () => {
      const demo = await prisma.tenant.findFirst({ where: { slug: 'demo-company' } });
      expect(demo).not.toBeNull();

      // Seeded on purpose with no specification, which is the state every
      // pre-existing product is in after the additive migration.
      const withoutSpecification = await prisma.product.findFirst({
        where: { tenantId: demo!.id, sku: 'SKU-DEMO-003' }
      });
      expect(withoutSpecification).not.toBeNull();

      const service = new ProductSpecificationService(
        prisma,
        new TenantCrudRepository(prisma, MODEL_OPTIONS.product)
      );

      const aggregate = await service.getAggregate(demo!.id, withoutSpecification!.id);

      expect(aggregate.specification).toBeNull();
      expect(aggregate.presentations).toEqual([]);
      expect(aggregate.suppliers).toEqual([]);
    });
  });
});
