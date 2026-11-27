"use client";

import { useActionState } from "react";
import { addTagAction, renameTagAction } from "@/app/admin/managed-list/actions";
import { Message } from "@/components/ui";

const input =
  "min-w-0 flex-1 rounded-xl border border-line bg-pitch px-3 py-2 text-base text-chalk focus:border-lime focus:outline-none";

export function RenameTag({ id, name, list }: { id: string; name: string; list: string }) {
  const [state, action] = useActionState(renameTagAction, undefined);
  return (
    <form action={action} className="flex flex-1 flex-col gap-1">
      <div className="flex gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="list" value={list} />
        <input name="name" defaultValue={name} maxLength={40} aria-label={`Name for ${name}`} className={input} />
        <button type="submit" className="rounded-xl border border-line px-3 text-sm">
          Save
        </button>
      </div>
      {state?.error && <p className="text-sm text-workon">{state.error}</p>}
      {state?.ok && <p className="text-sm text-lime">{state.ok}</p>}
    </form>
  );
}

export function AddTag({ list, placeholder, label }: { list: string; placeholder: string; label: string }) {
  const [state, action] = useActionState(addTagAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-2">
        <input type="hidden" name="list" value={list} />
        <input name="name" maxLength={40} placeholder={placeholder} aria-label={label} className={input} />
        <button type="submit" className="rounded-xl bg-lime px-4 font-semibold text-pitch">
          Add
        </button>
      </div>
      {state?.error && <Message kind="error">{state.error}</Message>}
      {state?.ok && <Message kind="success">{state.ok}</Message>}
    </form>
  );
}
