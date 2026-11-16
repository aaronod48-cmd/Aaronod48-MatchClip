import { brand } from "@/config/brand";

const steps = [
  { title: "Upload your match", text: "Film from the sideline and upload from your phone." },
  { title: "Tap yourself", text: "Pick your team's shape, your position and shirt number." },
  { title: "Get coach-reviewed clips", text: "A real coach checks every clip and writes your report." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-lime">
          {brand.name}
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight">{brand.tagline}</h1>
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

      <footer className="mt-auto pt-10 text-center text-xs text-muted">
        Questions? {brand.supportEmail}
      </footer>
    </main>
  );
}
