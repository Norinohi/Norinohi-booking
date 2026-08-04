"use client";

import { useState } from "react";

import SignUpForm from "../register/sign-up-form";
import SignInForm from "./sign-in-form";

export default function LoginScreen() {
  const [showSignIn, setShowSignIn] = useState(true);

  return showSignIn ? (
    <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
  ) : (
    <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}
