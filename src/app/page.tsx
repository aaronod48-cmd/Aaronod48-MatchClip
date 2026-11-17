import Image from "next/image";
import { Suspense } from "react";
import { brand } from "@/config/brand";
import { DatabaseStatus } from "@/components/database-status";

const steps = [
  { title: "Upload your match", text: "Film from the sideline and upload from your phone." },
  { title: "Tap yourself", text: "Pick your team's shape, your position and shirt number." },
  { title: "Get coach-reviewed clips", text: "A real coach checks every clip and writes your report." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-10">
      <header>
        <div className="flex items-center gap-3">
          {/* Decorative: the name next to it is what screen readers announce. */}
          <Image src={brand.logo} alt="" width={44} height={44} priority />
          <p className="text-2xl font-bold tracking-tight">{brand.name}</p>
        </div>
        <h1 className="mt-6 text-3xl font-bold leading-tight">{brand.tagline}</h1>
      </header>

      <ol className="mt-8 space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-2xl border border-line bg-pitch-raised p-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime font-bold text-pitch">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold">{step.title}</h2>
              <p className="mt-1 text-sm text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-8 rounded-2xl border border-line bg-pitch-raised p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Colour check
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-medium">
          <span className="rounded-full bg-lime px-3 py-1 text-pitch">Strength</span>
          <span className="rounded-full bg-workon px-3 py-1 text-pitch">Work-on</span>
          <span className="rounded-full border border-line px-3 py-1">Passing</span>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-pitch-raised p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Setup check
        </p>
        <Suspense fallback={<p className="mt-2 text-muted">Checking database…</p>}>
          <DatabaseStatus />
        </Suspense>
      </section>

      <footer className="mt-auto pt-10 text-center text-xs text-muted">
        Questions? {brand.supportEmail}
      </footer>
    </main>
  );
}
