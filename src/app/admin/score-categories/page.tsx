import type { Metadata } from "next";
import { Suspense } from "react";
import { ManagedList } from "@/app/admin/managed-list/list";
import { AuthShell } from "@/components/ui";

export const metadata: Metadata = { title: "Score categories" };

export default function ScoreCategoriesPage() {
  return (
    <AuthShell title="Score categories">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <ManagedList
          list="score_categories"
          help="The coach picks four of these for each report. Renaming one doesn't change reports already sent. Hidden ones aren't offered for new reports."
          addPlaceholder="New category, e.g. Work rate"
          addLabel="New score category name"
        />
      </Suspense>
    </AuthShell>
  );
}
