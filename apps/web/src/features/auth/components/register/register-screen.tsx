"use client";

import { useRouter } from "next/navigation";

import SignUpForm from "./sign-up-form";

export default function RegisterScreen() {
  const router = useRouter();

  return <SignUpForm onSwitchToSignIn={() => router.push("/login")} />;
}
