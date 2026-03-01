# API Reference

All endpoints are prefixed with your Better Auth base path (default: `/api/auth`).

## Endpoints

### POST `/invite-only/create`

Create a new invitation. **Requires admin session.**

**Body:**
```json
{
  "email": "user@example.com",
  "sendEmail": true,
  "maxUses": 1,
  "metadata": { "team": "engineering", "role": "member" }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| email | string | required | Invitee email address |
| sendEmail | boolean | `true` | Whether to send the invitation email |
| maxUses | number | `1` | Maximum number of times this code can be used (1-10,000) |
| metadata | object | `null` | Arbitrary metadata to attach to the invitation |

**Response:**
```json
{
  "id": "clx...",
  "code": "a1b2c3d4e5f6...",
  "email": "user@example.com",
  "inviteUrl": "https://app.com/register?invite=a1b2c3d4e5f6...",
  "expiresAt": "2026-02-27T18:00:00.000Z",
  "emailSent": true,
  "maxUses": 1,
  "metadata": { "team": "engineering", "role": "member" }
}
```

The plaintext `code` is returned exactly once. It is hashed before storage and cannot be retrieved again.

### POST `/invite-only/create-batch`

Create multiple invitations at once. **Requires admin session.** Max 50 per call.

**Body:**
```json
{
  "invitations": [
    { "email": "alice@example.com", "sendEmail": true },
    { "email": "bob@example.com", "sendEmail": true, "maxUses": 5 },
    { "email": "carol@example.com", "sendEmail": false, "metadata": { "dept": "sales" } }
  ]
}
```

**Response:**
```json
{
  "items": [
    { "id": "...", "code": "...", "email": "alice@example.com", "inviteUrl": "...", "expiresAt": "...", "emailSent": true, "maxUses": 1, "metadata": null },
    { "id": "...", "code": "...", "email": "bob@example.com", "inviteUrl": "...", "expiresAt": "...", "emailSent": true, "maxUses": 5, "metadata": null },
    { "id": "...", "code": "...", "email": "carol@example.com", "inviteUrl": "...", "expiresAt": "...", "emailSent": false, "maxUses": 1, "metadata": { "dept": "sales" } }
  ],
  "count": 3
}
```

### GET `/invite-only/list`

List invitations with optional filters. **Requires admin session.**

**Query params:**
- `status` -- `"all"` | `"pending"` | `"used"` | `"expired"` | `"revoked"` (default: `"all"`)
- `limit` -- 1-100 (default: 50)
- `cursor` -- ISO date string for cursor pagination

**Response:**
```json
{
  "items": [
    {
      "id": "...",
      "email": "...",
      "invitedBy": "...",
      "maxUses": 1,
      "useCount": 0,
      "status": "pending",
      "expiresAt": "...",
      "createdAt": "...",
      "metadata": { "team": "engineering" }
    }
  ],
  "nextCursor": "2026-02-19T12:00:00.000Z"
}
```

### POST `/invite-only/revoke`

Revoke an invitation (soft-delete). **Requires admin session.**

**Body:** `{ "id": "invitation-id" }`

**Response:** `{ "success": true }`

### POST `/invite-only/resend`

Resend the invitation email. **Requires admin session.** This revokes the old invitation and creates a new one with a fresh code -- the original hashed code cannot be recovered, so a clean replacement is the only option.

Fails if `sendInviteEmail` is not configured.

**Body:** `{ "id": "invitation-id" }`

**Response:**
```json
{ "success": true, "newInvitationId": "...", "inviteUrl": "..." }
```

### POST `/invite-only/delete`

Permanently delete an invitation record. **Requires admin session.** Use for GDPR compliance or cleanup.

**Body:** `{ "id": "invitation-id" }`

**Response:** `{ "success": true }`

### POST `/invite-only/validate`

Check if an invite code is valid. **Public endpoint.** Does not return email or any PII.

**Body:** `{ "code": "a1b2c3d4..." }`

**Response:**
```json
{ "valid": true, "expiresAt": "2026-02-27T..." }
```

### GET `/invite-only/stats`

Aggregate invitation statistics. **Requires admin session.**

**Response:**
```json
{ "total": 42, "pending": 15, "used": 20, "expired": 5, "revoked": 2 }
```

### GET `/invite-only/config`

Check if invite-only mode is active. **Public endpoint.** Useful for conditionally rendering the invite code field on your registration page.

**Response:**
```json
{ "enabled": true }
```

## Error Codes

Every error the plugin throws is a named, typed error code. Import them if you need to handle specific failures -- or don't, and let the message strings do the talking.

```typescript
import { ERROR_CODES } from "better-auth-invitation-only";

// Each code is { code: string, message: string }
ERROR_CODES.INVITE_REQUIRED.code;    // "INVITE_REQUIRED"
ERROR_CODES.INVITE_REQUIRED.message; // "Invitation code required"
```

| Code | HTTP Status | Message |
|------|-------------|---------|
| `INVITE_REQUIRED` | 403 | Invitation code required |
| `INVALID_INVITE` | 403 | Invalid or expired invitation code |
| `INVITE_EXPIRED` | 403 | Invitation code expired |
| `INVITE_EXHAUSTED` | 403 | Invitation has reached maximum uses |
| `EMAIL_MISMATCH` | 403 | This invitation code is for a different email address |
| `ADMIN_REQUIRED` | 403 | Admin access required |
| `NOT_FOUND` | 404 | Invitation not found |
| `ALREADY_USED` | 400 | Cannot revoke a used invitation |
| `ALREADY_REVOKED` | 400 | Invitation already revoked |
| `NO_LONGER_VALID` | 400 | Invitation is no longer valid |
| `DOMAIN_NOT_ALLOWED` | 400 | Email domain is not allowed |
| `BATCH_EMPTY` | 400 | At least one invitation is required |
| `EMAIL_NOT_CONFIGURED` | 400 | Email sending not configured |
| `EMAIL_SEND_FAILED` | 500 | Failed to send email |
| `TOO_MANY_PENDING` | 429 | Too many pending signups |

Error responses follow the Better Auth convention:

```json
{
  "code": "INVITE_REQUIRED",
  "message": "Invitation code required",
  "status": 403
}
```

## Rate Limits

Default rate limits (configurable via the `rateLimits` option):

| Endpoint | Max | Window |
|----------|-----|--------|
| `/invite-only/validate` | 10 | 60s |
| `/invite-only/create` | 20 | 60s |
| `/invite-only/create-batch` | 20 | 60s |
| `/invite-only/resend` | 10 | 60s |

Override defaults:
```typescript
inviteOnly({
  rateLimits: {
    validate: { max: 5, window: 30 },
    create: { max: 50, window: 120 },
    resend: { max: 5, window: 60 },
  },
})
```
