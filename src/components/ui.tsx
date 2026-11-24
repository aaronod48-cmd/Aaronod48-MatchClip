"use client";

import Image from "next/image";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { brand } from "@/config/brand";

/** Page frame for the sign-in screens: logo + name at the top, then the card. */
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
      <Link href="/" className="flex items-center gap-3 self-start">
        <Image src={brand.logo} alt="" width={36} height={36} priority />
        <span className="text-xl font-bold tracking-tight">{brand.name}</span>
      </Link>
      {title && <h1 className="mt-8 text-2xl font-bold">{title}</h1>}
      <div className={title ? "mt-6" : "mt-8"}>{children}</div>
    </main>
  );
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...input}
        className="mt-1 block w-full rounded-xl border border-line bg-pitch-raised px-4 py-3 text-base text-chalk placeholder:text-muted focus:border-lime focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-lime px-4 py-3 text-base font-semibold text-pitch disabled:opacity-60"
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function Message({ kind, children }: { kind: "error" | "info" | "success"; children: React.ReactNode }) {
  const styles = {
    error: "border-workon/50 text-workon",
    info: "border-line text-chalk",
    success: "border-lime/50 text-lime",
  }[kind];
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-xl border bg-pitch-raised px-4 py-3 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-lime underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
