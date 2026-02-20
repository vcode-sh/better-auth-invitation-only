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

	if (loading) return <div>Loading...</div>;

	// Gate: require invite code before showing form
	if (inviteOnly && !code) {
		return (
			<div>
				<h2>Invitation Required</h2>
				<p>Enter your invite code to create an account.</p>
				<input
					type="text"
					placeholder="Paste your invite code"
					value={code}
					onChange={(e) => setCode(e.target.value)}
					style={{ fontFamily: "monospace" }}
				/>
			</div>
		);
	}

	return (
		<form onSubmit={handleSubmit}>
			{code && (
				<div style={{ padding: "8px", background: "#f0f9f0", borderRadius: "4px" }}>
					Invite code: <code>{code.slice(0, 8)}...</code>
				</div>
			)}
			<input name="name" placeholder="Full name" required />
			<input name="email" type="email" placeholder="Email" required />
			<input name="password" type="password" placeholder="Password" minLength={8} required />
			<button type="submit">Create Account</button>
			<button type="button" onClick={handleGoogleSignIn}>
				Sign up with Google
			</button>
		</form>
	);
}
