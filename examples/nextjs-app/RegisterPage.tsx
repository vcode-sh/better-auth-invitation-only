"use client";

import { useEffect, useState } from "react";
import { authClient } from "./auth-client";

export function RegisterPage({ inviteCode }: { inviteCode?: string }) {
  const [code, setCode] = useState(inviteCode ?? "");
  const [inviteOnly, setInviteOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient.inviteOnly.getInviteConfig().then((config) => {
      setInviteOnly(config.enabled);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    await authClient.signUp.email({
      email: form.get("email") as string,
      password: form.get("password") as string,
      name: form.get("name") as string,
      inviteCode: code || undefined,
    });
  };

  const handleGoogleSignIn = () => {
    if (code) {
      authClient.inviteOnly.setInviteCodeCookie(code);
    }
    authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" });
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  // Gate: require invite code before showing form
  if (inviteOnly && !code) {
    return (
      <div>
        <h2>Invitation Required</h2>
        <p>Enter your invite code to create an account.</p>
        <input
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste your invite code"
          style={{ fontFamily: "monospace" }}
          type="text"
          value={code}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {code && (
        <div
          style={{ padding: "8px", background: "#f0f9f0", borderRadius: "4px" }}
        >
          Invite code: <code>{code.slice(0, 8)}...</code>
        </div>
      )}
      <input name="name" placeholder="Full name" required />
      <input name="email" placeholder="Email" required type="email" />
      <input
        minLength={8}
        name="password"
        placeholder="Password"
        required
        type="password"
      />
      <button type="submit">Create Account</button>
      <button onClick={handleGoogleSignIn} type="button">
        Sign up with Google
      </button>
    </form>
  );
}
