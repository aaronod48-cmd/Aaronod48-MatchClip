import { notFound, redirect } from "next/navigation";
import { TextLink } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { moveTagAction, setTagActiveAction } from "./actions";
import { AddTag, RenameTag } from "./forms";

/** Shared screen for admin-managed name lists (tags, score categories). */
export async function ManagedList({
  list,
  help,
  addPlaceholder,
  addLabel,
}: {
  list: "tags" | "score_categories";
  help: string;
  addPlaceholder: string;
  addLabel: string;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", me).maybeSingle();
  if (profile?.role !== "admin") notFound();

  const { data: tags } = await supabase
    .from(list)
    .select("id, name, is_active, sort_order")
    .order("sort_order")
    .order("name");
  const rows = tags ?? [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{help}</p>
      <ul className="space-y-3">
        {rows.map((t, i) => (
          <li
            key={t.id}
            className={`rounded-2xl border border-line bg-pitch-raised p-3 ${t.is_active ? "" : "opacity-60"}`}
          >
            <div className="flex items-start gap-2">
              <div className="flex flex-col">
                <form action={moveTagAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="list" value={list} />
                  <input type="hidden" name="direction" value="up" />
                  <button
                    type="submit"
                    disabled={i === 0}
                    aria-label={`Move ${t.name} up`}
                    className="px-2 text-muted disabled:opacity-30"
                  >
                    ▲
                  </button>
                </form>
                <form action={moveTagAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="list" value={list} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={i === rows.length - 1}
                    aria-label={`Move ${t.name} down`}
                    className="px-2 text-muted disabled:opacity-30"
                  >
                    ▼
                  </button>
                </form>
              </div>
              <RenameTag id={t.id} name={t.name} list={list} />
            </div>
            <form action={setTagActiveAction} className="mt-2 flex items-center justify-between pl-10 text-sm">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="list" value={list} />
              <input type="hidden" name="active" value={t.is_active ? "no" : "yes"} />
              <span className={t.is_active ? "text-lime" : "text-muted"}>{t.is_active ? "Shown" : "Hidden"}</span>
              <button type="submit" className="text-muted underline">
                {t.is_active ? `Hide ${t.name}` : `Show ${t.name}`}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <AddTag list={list} placeholder={addPlaceholder} label={addLabel} />
      <p className="text-center text-sm">
        <TextLink href="/dashboard">Back to home</TextLink>
      </p>
    </div>
  );
}
