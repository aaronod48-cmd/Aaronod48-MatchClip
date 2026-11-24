import { brand } from "@/config/brand";
import { consent, fillConsent } from "@/config/consent";

/** The consent wording, with the child's name filled in. */
export function ConsentText({ child }: { child: string }) {
  const fill = (t: string) => fillConsent(t, { child, brand: brand.name, support: brand.supportEmail });
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">{fill(consent.title)}</h2>
        <p className="mt-2 text-muted">{fill(consent.intro)}</p>
      </div>
      {consent.sections.map((s) => (
        <section key={s.heading} className="rounded-2xl border border-line bg-pitch-raised p-4">
          <h3 className="font-semibold text-lime">{fill(s.heading)}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
            {s.points.map((p) => (
              <li key={p}>{fill(p)}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-muted">Wording version: {consent.version}</p>
    </div>
  );
}

export function consentConfirmLabel(child: string) {
  return fillConsent(consent.confirmLabel, { child, brand: brand.name, support: brand.supportEmail });
}
