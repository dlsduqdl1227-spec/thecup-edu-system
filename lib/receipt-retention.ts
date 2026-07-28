export const RECEIPT_STORAGE_LIMIT_BYTES = 250_000_000;
export const RECEIPT_STORAGE_TARGET_BYTES = 200_000_000;

export type StoredReceipt = {
  movementId: number;
  size: number;
  createdAt: string;
};

export type ReceiptCleanupPlan = {
  movementIds: number[];
  bytesBefore: number;
  bytesReclaimed: number;
  projectedBytes: number;
};

export function planReceiptCleanup(
  receipts: StoredReceipt[],
  incomingBytes: number,
): ReceiptCleanupPlan {
  if (!Number.isFinite(incomingBytes) || incomingBytes < 0) {
    throw new Error("영수증 파일 크기가 올바르지 않습니다.");
  }

  const bytesBefore = receipts.reduce((sum, receipt) => sum + Math.max(0, receipt.size), 0);
  if (bytesBefore + incomingBytes <= RECEIPT_STORAGE_LIMIT_BYTES) {
    return {
      movementIds: [],
      bytesBefore,
      bytesReclaimed: 0,
      projectedBytes: bytesBefore + incomingBytes,
    };
  }

  const oldestFirst = [...receipts].sort((left, right) => {
    const dateDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return dateDifference || left.movementId - right.movementId;
  });
  const movementIds: number[] = [];
  let bytesReclaimed = 0;

  for (const receipt of oldestFirst) {
    movementIds.push(receipt.movementId);
    bytesReclaimed += Math.max(0, receipt.size);
    if (bytesBefore - bytesReclaimed + incomingBytes <= RECEIPT_STORAGE_TARGET_BYTES) break;
  }

  const projectedBytes = bytesBefore - bytesReclaimed + incomingBytes;
  if (projectedBytes > RECEIPT_STORAGE_LIMIT_BYTES) {
    throw new Error("영수증 저장공간을 확보할 수 없습니다. 관리자에게 문의해 주세요.");
  }

  return { movementIds, bytesBefore, bytesReclaimed, projectedBytes };
}
