import type { Metadata } from "next";
import { AuthShell } from "@/components/ui";
import { AddChildForm } from "./add-child-form";

export const metadata: Metadata = { title: "Add a child" };

export default function AddChildPage() {
  return (
    <AuthShell title="Add a child">
      <AddChildForm />
    </AuthShell>
  );
}
