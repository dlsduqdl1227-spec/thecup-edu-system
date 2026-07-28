const quantityNumber = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

export type InventoryDisplayAmount = {
  value: string;
  unit: string;
};

export function inventoryQuantityInKilograms(quantity: number, unit: string): number {
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === "g") return quantity / 1000;
  if (normalizedUnit === "kg" || normalizedUnit === "㎏") return quantity;
  throw new Error("원두 재고 단위는 g 또는 kg이어야 합니다.");
}

export function kilogramsToInventoryQuantity(kilograms: number, unit: string): number {
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === "g") return kilograms * 1000;
  if (normalizedUnit === "kg" || normalizedUnit === "㎏") return kilograms;
  throw new Error("원두 재고 단위는 g 또는 kg이어야 합니다.");
}

export function formatBeanAmount(quantity: number, unit: string): InventoryDisplayAmount {
  return {
    value: quantityNumber.format(inventoryQuantityInKilograms(quantity, unit)),
    unit: "kg",
  };
}

export function formatBeanQuantity(quantity: number, unit: string, signed = false): string {
  const amount = formatBeanAmount(quantity, unit);
  const sign = signed && quantity > 0 ? "+" : "";
  return `${sign}${amount.value}${amount.unit}`;
}

export function formatInventoryAmount(
  quantity: number,
  unit: string,
): InventoryDisplayAmount {
  const normalizedUnit = unit.trim();
  if (normalizedUnit.toLowerCase() === "g" && Math.abs(quantity) >= 1000) {
    return { value: quantityNumber.format(quantity / 1000), unit: "kg" };
  }
  return { value: quantityNumber.format(quantity), unit: normalizedUnit };
}

export function formatInventoryQuantity(quantity: number, unit: string): string {
  const amount = formatInventoryAmount(quantity, unit);
  return `${amount.value}${amount.unit}`;
}

export function formatSignedInventoryQuantity(quantity: number, unit: string): string {
  return `${quantity > 0 ? "+" : ""}${formatInventoryQuantity(quantity, unit)}`;
}
