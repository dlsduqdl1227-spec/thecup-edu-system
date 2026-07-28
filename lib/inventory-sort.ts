export type InventorySort = "expiry" | "attention" | "quantityAsc" | "quantityDesc" | "name";

export type SortableInventoryItem = {
  name: string;
  expiryDate: string | null;
  unit: string;
  quantity: number;
  reorderLevel: number;
  lowStock: number;
};

export function inventoryQuantitySortValue(quantity: number, unit: string): number {
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === "kg" || normalizedUnit === "㎏") return quantity * 1000;
  if (normalizedUnit === "l") return quantity * 1000;
  return quantity;
}

export function compareInventoryItems(
  left: SortableInventoryItem,
  right: SortableInventoryItem,
  sort: InventorySort,
): number {
  const byName = left.name.localeCompare(right.name, "ko-KR");
  if (sort === "name") return byName;

  if (sort === "expiry") {
    const leftExpiry = dateOnly(left.expiryDate);
    const rightExpiry = dateOnly(right.expiryDate);
    if (leftExpiry && rightExpiry) return leftExpiry.localeCompare(rightExpiry) || byName;
    if (leftExpiry) return -1;
    if (rightExpiry) return 1;
    return byName;
  }

  if (sort === "attention") {
    const statusDifference = Number(right.lowStock) - Number(left.lowStock);
    if (statusDifference) return statusDifference;
    const leftRatio = left.reorderLevel > 0 ? left.quantity / left.reorderLevel : Number.POSITIVE_INFINITY;
    const rightRatio = right.reorderLevel > 0 ? right.quantity / right.reorderLevel : Number.POSITIVE_INFINITY;
    return (leftRatio - rightRatio) || byName;
  }

  const leftQuantity = inventoryQuantitySortValue(left.quantity, left.unit);
  const rightQuantity = inventoryQuantitySortValue(right.quantity, right.unit);
  const quantityDifference = leftQuantity - rightQuantity;
  return (sort === "quantityAsc" ? quantityDifference : -quantityDifference) || byName;
}

function dateOnly(value: string | null): string | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}
