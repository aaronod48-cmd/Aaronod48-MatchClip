"use client";

import { useSearchParams } from "next/navigation";

export function CheckEmailText() {
  const isReset = useSearchParams().get("for") === "reset";
  return (
    <p className="text-base">
      {isReset
        ? "If there's an account with that email, we've sent a link to choose a new password."
        : "We've sent you a link to verify your email. Tap it to finish creating your account."}
    </p>
  );
}
