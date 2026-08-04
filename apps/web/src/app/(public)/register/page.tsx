"use client";

import { useRouter } from "next/navigation";

import { SignUpForm } from "@/features/auth";

export default function RegisterPage() {
  const router = useRouter();

  return <SignUpForm onSwitchToSignIn={() => router.push("/login")} />;
}
