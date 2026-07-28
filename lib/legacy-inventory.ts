export type LegacyInventoryEntry = {
  id: string;
  created_at: string;
  item: string;
  lot: string;
  type: string;
  amount_mkg: number;
  expiry_date: string | null;
  process: string;
  category: "GREEN" | "ROASTED";
};

export type LegacyInventorySummary = {
  legacyKey: string;
  category: "green" | "gusto";
  name: string;
  lot: string;
  process: string;
  expiryDate: string | null;
  unit: "kg" | "g";
  quantity: number;
  reorderLevel: number;
};

const STOCK_EPSILON = 0.0001;

export function normalizeLegacyCategory(
  entry: Pick<LegacyInventoryEntry, "item" | "category">,
): LegacyInventorySummary["category"] {
  return entry.category === "ROASTED" || entry.item.includes("구스토")
    ? "gusto"
    : "green";
}

export function legacyInventoryKey(
  entry: Pick<LegacyInventoryEntry, "item" | "lot" | "category">,
): string {
  return `${normalizeLegacyCategory(entry)}\u001f${entry.item.trim()}\u001f${entry.lot.trim()}`;
}

export function summarizeLegacyInventory(
  entries: LegacyInventoryEntry[],
): LegacyInventorySummary[] {
  const groups = new Map<string, LegacyInventorySummary>();

  for (const entry of entries) {
    const category = normalizeLegacyCategory(entry);
    const legacyKey = legacyInventoryKey(entry);
    const existing = groups.get(legacyKey);
    const quantityDelta =
      category === "green" ? Number(entry.amount_mkg) / 1000 : Number(entry.amount_mkg);

    if (existing) {
      existing.quantity += quantityDelta;
      if (!existing.process && entry.process) existing.process = entry.process;
      if (!existing.expiryDate && entry.expiry_date) {
        existing.expiryDate = toDateOnly(entry.expiry_date);
      }
      continue;
    }

    groups.set(legacyKey, {
      legacyKey,
      category,
      name: entry.item.trim(),
      lot: entry.lot.trim(),
      process: entry.process?.trim() ?? "",
      expiryDate: toDateOnly(entry.expiry_date),
      unit: category === "green" ? "kg" : "g",
      quantity: quantityDelta,
      reorderLevel: category === "green" ? 5 : 1000,
    });
  }

  return [...groups.values()]
    .filter((item) => item.quantity > STOCK_EPSILON)
    .map((item) => ({ ...item, quantity: roundQuantity(item.quantity) }))
    .sort((a, b) =>
      `${a.category}\u001f${a.name}\u001f${a.lot}`.localeCompare(
        `${b.category}\u001f${b.name}\u001f${b.lot}`,
        "ko",
      ),
    );
}

export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
