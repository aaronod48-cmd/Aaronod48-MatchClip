"use client";

import { useActionState, useState } from "react";
import { signUpAction } from "@/app/auth-actions";
import { Field, Message, SubmitButton, TextLink } from "@/components/ui";
import { ageRules } from "@/config/age-rules";
import { passwordRules } from "@/lib/auth/validation";

const choices = [
  { value: "parent", title: "Parent or guardian", text: "Sign up your child (under 18)." },
  { value: "player", title: `Player aged ${ageRules.adultAge}+`, text: "Use it for your own matches." },
] as const;

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, undefined);
  const [accountType, setAccountType] = useState<string>("parent");

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">I am a…</legend>
        <div className="mt-2 grid gap-2">
          {choices.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 ${
                accountType === c.value ? "border-lime bg-pitch-raised" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value={c.value}
                checked={accountType === c.value}
                onChange={() => setAccountType(c.value)}
                className="mt-1 accent-lime"
              />
              <span>
                <span className="block font-semibold">{c.title}</span>
                <span className="block text-sm text-muted">{c.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Your first name" name="firstName" autoComplete="given-name" required maxLength={40} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={passwordRules.minLength}
        hint={passwordRules.description}
      />

      <label className="flex gap-3 text-sm">
        <input type="checkbox" name="isAdult" value="yes" required className="mt-0.5 h-5 w-5 accent-lime" />
        <span>
          I confirm I am {ageRules.adultAge} or over. Under {ageRules.adultAge}? Ask a parent or guardian to sign up
          and add you.
        </span>
      </label>

      {state?.error && <Message kind="error">{state.error}</Message>}

      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>

      <p className="text-center text-sm text-muted">
        Already have an account? <TextLink href="/login">Log in</TextLink>
      </p>
    </form>
  );
}
