# Security Policy

## Supported Versions

I only patch what's current. If you're running something older, you're on your own and I wish you well.

| Version | Supported          |
|---------|--------------------|
| 0.2.x   | Yes                 |
| < 0.2   | No (upgrade, mate)  |

## Found a Vulnerability?

First of all, thank you. Second of all, please do not open a public GitHub issue. I know the temptation to post "CRITICAL SECURITY FLAW" in big letters is strong, but broadcasting a vulnerability before it's patched is the infosec equivalent of leaving your front door open and tweeting your address.

**Email hello@vcode.sh** with:

- What the vulnerability is (be specific -- "something feels off" is not actionable)
- Steps to reproduce it
- The potential impact (how bad could this get?)
- A suggested fix, if you have one (I'm not proud)

I'll acknowledge your report within 48 hours. Critical issues get patched within 7 days. I'll credit you in the release notes unless you'd prefer to remain a mysterious security benefactor.

## What I've Already Thought About

This plugin was built by someone who's read enough CVEs to develop a nervous twitch. Here's what's baked in:

- **SHA-256 code hashing** -- invite codes are never stored in plaintext, because storing secrets in plaintext is how you end up on Hacker News for the wrong reasons
- **Email binding** -- signup email must match the invitation target, so stealing a code doesn't help unless you've also stolen an inbox
- **Rate limiting** -- per-endpoint limits prevent brute-force attacks, because some people have more GPUs than sense
- **Input validation** -- all inputs validated with Zod, max 256 characters, because trusting user input is the original sin of web development
- **No PII in public endpoints** -- the validate endpoint never returns email addresses, because privacy isn't a feature, it's the default
- **Cookie security** -- `Secure` flag, `SameSite=Lax`, short TTL for the OAuth flow, because cookies are already a nightmare without making them worse
- **Memory safety** -- pending invites map has a 5-minute TTL and 10K entry cap, because an unbounded in-memory map is just a slow memory leak with extra steps
