export type InventoryMovementType = "in" | "out" | "adjust";

// Blank inputs are not zero. Keep the same decimal precision in previews and storage.
export function readStockQuantity(value: unknown, label = "수량"): number {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new Error(`${label}을 입력해 주세요. 재고를 비우려면 0을 입력하세요.`);
  }
  if (typeof value === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    throw new Error(`${label}은 숫자로 입력해 주세요. 예: 0, 0.5, 1`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000) {
    throw new Error(`${label}은 0 이상 10억 이하로 입력해 주세요.`);
  }
  if ((number > 0 && roundStockQuantity(number) === 0) || Math.abs(number - roundStockQuantity(number)) > 1e-9) {
    throw new Error(`${label}은 소수점 6자리까지 입력해 주세요.`);
  }
  return roundStockQuantity(number);
}

export function roundStockQuantity(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function inventoryChange(current: number, quantity: number, type: InventoryMovementType) {
  const next = type === "adjust" ? quantity : roundStockQuantity(current + (type === "out" ? -quantity : quantity));
  if (next < 0) throw new Error("출고 수량이 현재 재고보다 많습니다. 수량을 확인해 주세요.");
  return { nextQuantity: next, delta: roundStockQuantity(next - current) };
}
