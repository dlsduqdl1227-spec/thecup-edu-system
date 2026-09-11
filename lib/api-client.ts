export async function requestJson<T = { ok: boolean }>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("연결이 끊어졌습니다. 입력 내용은 유지됩니다. 내역을 확인한 뒤 다시 시도해 주세요.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : null;
    throw new Error(message || (response.status === 413 ? "사진 파일이 너무 큽니다. 다른 사진을 선택해 주세요." : "서버 응답을 받지 못했습니다. 잠시 후 내역을 다시 확인해 주세요."));
  }
  if (!body || typeof body !== "object") {
    throw new Error("처리 결과를 확인하지 못했습니다. 입력 내용은 유지됩니다. 내역을 새로고침해 확인해 주세요.");
  }
  return body as T;
}
