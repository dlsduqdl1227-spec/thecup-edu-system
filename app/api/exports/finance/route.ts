import { requirePermission } from "../../../../lib/auth";
import { ensureDatabase, getD1 } from "../../../../lib/db";
import { jsonError } from "../../../../lib/http";
import { koreanDateStamp, xlsxResponse } from "../../../../lib/xlsx";

type FinanceMonthRow = {
  year: number;
  month: number;
  revenue: number;
  expense: number;
  profit: number;
  note: string;
  source: string;
};

type FinanceTransactionRow = {
  transactionDate: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  description: string;
  createdByName: string;
  createdAt: string;
};

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    await requirePermission(request, "finance");
    const db = getD1();
    const [monthly, transactions] = await Promise.all([
      db
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
        .all<FinanceMonthRow>(),
      db
        .prepare(
          `SELECT t.transaction_date AS transactionDate, t.kind, t.category, t.amount,
                  t.description, s.name AS createdByName, t.created_at AS createdAt
           FROM finance_transactions t
           JOIN staff s ON s.id = t.created_by
           ORDER BY t.transaction_date, t.id`,
        )
        .all<FinanceTransactionRow>(),
    ]);

    return xlsxResponse(`더컵에듀_매출및지출_${koreanDateStamp()}.xlsx`, [
      {
        name: "월별 매출",
        columns: ["연도", "월", "매출", "지출", "순익", "비고", "자료 출처"],
        rows: monthly.results.map((row) => [
          row.year,
          row.month,
          Number(row.revenue),
          Number(row.expense),
          Number(row.profit),
          row.note,
          row.source,
        ]),
      },
      {
        name: "추가 매출·지출",
        columns: ["거래일", "구분", "분류", "금액", "설명", "등록자", "등록 시각"],
        rows: transactions.results.map((row) => [
          row.transactionDate,
          row.kind === "income" ? "매출" : "지출",
          row.category,
          Number(row.amount),
          row.description,
          row.createdByName,
          row.createdAt,
        ]),
      },
    ]);
  } catch (error) {
    return jsonError(error);
  }
}
