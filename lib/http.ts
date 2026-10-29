import { AuthError } from "./auth";

export function jsonError(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status,
      headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } : undefined });
  }
  const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.";
  if (message.includes("course_enrollments.request_key")) {
    return Response.json({ error: "같은 수강 등록이 이미 처리되었습니다. 새로고침하여 등록 내역을 확인해 주세요." }, { status: 409 });
  }
  if (message.includes("learning_")) {
    const reason = message.includes("learning_enrollment_required") ? "결제 확인 후 과정이 등록되면 예약할 수 있습니다. 담당자에게 문의해 주세요."
      : message.includes("learning_instructor_overlap") ? "담당 강사에게 같은 시간의 확정 수업이 있습니다. 다른 시간 또는 담당 강사를 확인해 주세요."
      : message.includes("learning_member_overlap") ? "같은 시간에 신청했거나 확정된 수업이 있습니다. 기존 예약을 먼저 확인해 주세요."
      : "남은 회차, 담당 강사 또는 시간대가 변경되었습니다. 수강 정보를 새로고침해 주세요.";
    return Response.json({ error: reason }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (message.includes("UNIQUE constraint failed: stations.name")) {
    return Response.json({ error: "같은 이름의 스테이션이 이미 있습니다. 다른 이름을 입력해 주세요." }, { status: 409 });
  }
  if (message.includes("inventory_quantity_negative")) {
    return Response.json(
      { error: "다른 작업으로 재고가 변경됐습니다. 현재 수량을 새로고침한 뒤 다시 입력해 주세요." },
      { status: 409 },
    );
  }
  if (/(D1_ERROR|SQLITE|constraint failed|database)/i.test(message)) {
    console.error("Internal persistence error", error);
    return Response.json(
      { error: "저장 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
  return Response.json({ error: message }, { status: 400 });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  if (new URL(origin).host !== requestUrl.host) {
    throw new AuthError("허용되지 않은 요청입니다.", 403);
  }
}

export function textValue(value: unknown, label: string, maxLength = 200): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label}을(를) 입력해 주세요.`);
  if (text.length > maxLength) throw new Error(`${label}이(가) 너무 깁니다.`);
  return text;
}

export function optionalText(value: unknown, maxLength = 1000): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > maxLength) throw new Error("입력 내용이 너무 깁니다.");
  return text;
}

export function positiveNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label}은(는) 0보다 커야 합니다.`);
  }
  return number;
}

export function nonNegativeNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label}은(는) 0 이상이어야 합니다.`);
  }
  return number;
}

export function integerAmount(value: unknown, label = "금액"): number {
  const amount = Math.round(positiveNumber(value, label));
  if (amount > 1000000000) throw new Error(`${label}이(가) 허용 범위를 넘었습니다.`);
  return amount;
}

export function isoDate(value: unknown): string {
  const text = textValue(value, "날짜", 10);
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!matched) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("존재하지 않는 날짜입니다.");
  }
  return text;
}
