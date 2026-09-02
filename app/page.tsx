import { BookingPortal } from "./components/BookingPortal";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const params = await searchParams;
  const view = typeof params.view === "string" && ["student", "visitor", "consultation"].includes(params.view)
    ? params.view as "student" | "visitor" | "consultation"
    : null;
  return <BookingPortal key={view ?? "home"} initialEntry={view} />;
}
