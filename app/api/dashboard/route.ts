import { requireUser } from "../../../lib/auth";
import {
  ensureDatabase,
  getD1,
  readLegacyInventoryEntries,
} from "../../../lib/db";
import {
  legacyInventoryKey,
  normalizeLegacyCategory,
  toDateOnly,
} from "../../../lib/legacy-inventory";
import { jsonError } from "../../../lib/http";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const user = await requireUser(request);
    const db = getD1();

    const finance =
      user.canFinance
        ? await db
            .prepare(
              `SELECT m.year, m.month,
                      m.revenue + COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount ELSE 0 END), 0) AS revenue,
                      m.baseline_expense + COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END), 0) AS expense,
                      m.revenue + COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount ELSE 0 END), 0)
                        - m.baseline_expense
                        - COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END), 0) AS profit,
                      m.note, m.source
               FROM monthly_finance m
               LEFT JOIN finance_transactions t
                 ON CAST(strftime('%Y', t.transaction_date) AS INTEGER) = m.year
                AND CAST(strftime('%m', t.transaction_date) AS INTEGER) = m.month
               GROUP BY m.id
               ORDER BY m.year, m.month`,
            )
            .all()
        : { results: [] };

    const inventory = await db
      .prepare(
        `SELECT id, category, name, lot, process, expiry_date AS expiryDate,
                legacy_key AS legacyKey,
                unit, quantity, reorder_level AS reorderLevel,
                EXISTS(SELECT 1 FROM inventory_movements m WHERE m.item_id = inventory_items.id) AS hasMovements,
                CASE WHEN quantity <= reorder_level THEN 1 ELSE 0 END AS lowStock
         FROM inventory_items
         WHERE active = 1 ${user.canInventory ? "" : "AND category IN ('milk','roasted','gusto')"}
         ORDER BY category, name`,
      )
      .all<{
        id: number;
        category: string;
        name: string;
        lot: string;
        process: string;
        expiryDate: string | null;
        legacyKey: string | null;
        unit: string;
        quantity: number;
        reorderLevel: number;
        hasMovements: number;
        lowStock: number;
      }>();

    const ownMovementScope = user.role === "instructor" || !user.canInventory;
    const movementSql =
      ownMovementScope
        ? `SELECT m.id, m.item_id AS itemId, m.movement_type AS movementType, m.quantity,
                  m.movement_date AS movementDate, m.note, m.class_name AS className,
                  m.cost_amount AS costAmount, m.receipt_key IS NOT NULL AS hasReceipt,
                  m.receipt_deleted_at IS NOT NULL AS receiptArchived,
                  i.name AS itemName, i.category AS itemCategory, i.unit, m.created_by AS createdById,
                  s.name AS createdByName,
                  m.created_at AS createdAt
           FROM inventory_movements m
           JOIN inventory_items i ON i.id = m.item_id
           JOIN staff s ON s.id = m.created_by
           WHERE m.created_by = ? AND i.category IN ('milk','roasted','gusto')
           ORDER BY m.id DESC`
        : `SELECT m.id, m.item_id AS itemId, m.movement_type AS movementType, m.quantity,
                  m.movement_date AS movementDate, m.note, m.class_name AS className,
                  m.cost_amount AS costAmount, m.receipt_key IS NOT NULL AS hasReceipt,
                  m.receipt_deleted_at IS NOT NULL AS receiptArchived,
                  i.name AS itemName, i.category AS itemCategory, i.unit, m.created_by AS createdById,
                  s.name AS createdByName,
                  m.created_at AS createdAt
           FROM inventory_movements m
           JOIN inventory_items i ON i.id = m.item_id
           JOIN staff s ON s.id = m.created_by
           ORDER BY m.id DESC`;
    const movements =
      ownMovementScope
        ? await db.prepare(movementSql).bind(user.id).all()
        : await db.prepare(movementSql).all();

    const legacyEntries = user.role !== "instructor" && user.canInventory
      ? await readLegacyInventoryEntries(db)
      : [];
    const inventoryByLegacyKey = new Map(
      inventory.results
        .filter((item) => item.legacyKey)
        .map((item) => [item.legacyKey as string, item]),
    );
    const legacyMovements = legacyEntries.map((entry) => {
      const category = normalizeLegacyCategory(entry);
      const masterItem = inventoryByLegacyKey.get(legacyInventoryKey(entry));
      const movementType = entry.type === "입고"
        ? "in"
        : category === "green"
          ? "roast_out"
          : "out";
      const expiryDate = toDateOnly(entry.expiry_date);
      const displayedExpiryDate = toDateOnly(masterItem?.expiryDate) ?? expiryDate;
      return {
        id: `legacy:${entry.id}`,
        itemId: 0,
        movementType,
        quantity: Number(entry.amount_mkg) / 1000,
        movementDate: entry.created_at.slice(0, 10),
        note: [
          (masterItem?.lot ?? entry.lot) ? `LOT ${masterItem?.lot ?? entry.lot}` : "",
          masterItem?.process ?? entry.process,
          displayedExpiryDate ? `소비기한 ${displayedExpiryDate}` : "",
        ].filter(Boolean).join(" · "),
        className: "",
        costAmount: 0,
        hasReceipt: 0,
        receiptArchived: 0,
        itemName: masterItem?.name ?? entry.item,
        itemCategory: category,
        unit: "kg",
        legacyProcess: entry.process,
        legacyExpiryDate: expiryDate,
        createdByName: "기존 재고 기록",
        createdAt: entry.created_at,
      };
    });
    const permissionFilteredMovements = movements.results.map((movement) => {
      const row = movement as Record<string, unknown>;
      const canViewFinancialDetails = user.canFinance || Number(row.createdById) === user.id;
      return canViewFinancialDetails
        ? row
        : { ...row, costAmount: 0, hasReceipt: 0, receiptArchived: 0 };
    });
    const combinedMovements = [
      ...permissionFilteredMovements,
      ...legacyMovements,
    ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    const transactions =
      user.canFinance
        ? await db
            .prepare(
              `SELECT t.id, t.kind, t.category, t.amount,
                      t.transaction_date AS transactionDate, t.description,
                      t.inventory_movement_id AS inventoryMovementId,
                      s.name AS createdByName, t.created_at AS createdAt
               FROM finance_transactions t
               JOIN staff s ON s.id = t.created_by
               ORDER BY t.id DESC LIMIT 40`,
            )
            .all()
        : { results: [] };

    const profiles =
      user.canRoasting
        ? await db
            .prepare(
              `SELECT p.id, p.bean_name AS beanName, p.origin, p.process,
                      p.batch_weight AS batchWeight, p.charge_temp AS chargeTemp,
                      COALESCE(p.turning_point_seconds, p.yellowing_seconds) AS turningPointSeconds,
                      p.first_crack_seconds AS firstCrackSeconds,
                      p.drop_temp AS dropTemp, p.total_seconds AS totalSeconds,
                      p.development_seconds AS developmentSeconds,
                      p.development_ratio AS developmentRatio,
                      p.gas_notes AS gasNotes, p.notes, p.created_at AS createdAt,
                      s.name AS createdByName
               FROM roasting_profiles p
               JOIN staff s ON s.id = p.created_by
               ORDER BY p.id DESC`,
            )
            .all()
        : { results: [] };

    return Response.json({
      user,
      finance: finance.results,
      inventory: inventory.results,
      movements: combinedMovements,
      legacyInventoryCount: legacyEntries.length,
      transactions: transactions.results,
      profiles: profiles.results,
    });
  } catch (error) {
    return jsonError(error);
  }
}
