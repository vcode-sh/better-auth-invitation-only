# API Reference

## Endpoints

All endpoints are prefixed with your Better Auth base path (default: `/api/auth`).

### POST `/invite-only/create`

Create a new invitation. **Requires admin session.**

**Body:**
```json
{ "email": "user@example.com", "sendEmail": true }
```

**Response:**
```json
{
  "id": "clx...",
  "code": "a1b2c3d4e5f6...",
  "email": "user@example.com",
  "inviteUrl": "https://app.com/register?invite=a1b2c3d4e5f6...",
  "expiresAt": "2026-02-27T18:00:00.000Z",
  "emailSent": true
}
```

### GET `/invite-only/list`

List invitations with optional filters. **Requires admin session.**

**Query params:**
- `status` — `"all"` | `"pending"` | `"used"` | `"expired"` | `"revoked"` (default: `"all"`)
- `limit` — 1-100 (default: 50)
- `cursor` — ISO date string for cursor pagination

**Response:**
```json
{
  "items": [{ "id": "...", "email": "...", "code": "...", "status": "pending", ... }],
  "nextCursor": "2026-02-19T12:00:00.000Z"
}
```

### POST `/invite-only/revoke`

Revoke an invitation (soft-delete). **Requires admin session.**

**Body:** `{ "id": "invitation-id" }`

### POST `/invite-only/resend`

Resend the invitation email. **Requires admin session.** Fails if `sendInviteEmail` is not configured.

**Body:** `{ "id": "invitation-id" }`

### POST `/invite-only/validate`

Check if an invite code is valid. **Public endpoint.**

**Body:** `{ "code": "a1b2c3d4..." }`

**Response:**
```json
{ "valid": true, "email": "user@example.com", "expiresAt": "2026-02-27T..." }
```

### GET `/invite-only/stats`

Get aggregate invitation stats. **Requires admin session.**

**Response:**
```json
{ "total": 42, "pending": 15, "used": 20, "expired": 5, "revoked": 2 }
```

### GET `/invite-only/config`

Get invite-only configuration. **Public endpoint.** Useful for frontend to conditionally show the invite code field.

**Response:**
```json
{ "enabled": true, "registerPath": "/register", "cookieName": "ba-invite-code", "cookieMaxAge": 300 }
```

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/invite-only/validate` | 10 | 60s |
| `/invite-only/create` | 20 | 60s |
| `/invite-only/resend` | 10 | 60s |
