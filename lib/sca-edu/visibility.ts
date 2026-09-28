import { getD1 } from "../db";
import { applyStatusOverrides, type StatusOverride } from "./catalog";
import { EDU_CATALOG } from "./decks";

export async function effectiveEduCatalog() {
  const rows = await getD1().prepare(
    "SELECT course_id AS courseId, level, status FROM edu_deck_visibility",
  ).all<StatusOverride>();
  return applyStatusOverrides(EDU_CATALOG, rows.results);
}

export function privateEduResponse(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
