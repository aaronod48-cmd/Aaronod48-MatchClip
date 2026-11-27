import type { Metadata } from "next";
import { Suspense } from "react";
import { ManagedList } from "@/app/admin/managed-list/list";
import { AuthShell } from "@/components/ui";

export const metadata: Metadata = { title: "Manage tags" };

export default function TagsPage() {
  return (
    <AuthShell title="Manage tags">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <ManagedList
          list="tags"
          help="Renaming a tag changes it on every clip that has it. Hidden tags aren't offered for new clips, but clips that already have them keep them."
          addPlaceholder="New tag, e.g. Heading"
          addLabel="New tag name"
        />
      </Suspense>
    </AuthShell>
  );
}
