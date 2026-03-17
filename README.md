# Wix ↔ HubSpot Sync

 - A production-ready, responsive, self-hosted Wix app enabling bi-directional contact sync, form lead capture with UTM attribution, secure OAuth 2.0 token management, and a field-mapping dashboard UI.

 Note: `For successful Oauth Flow in WIX SITE, disable browser blockers if enabled or run in incognito window in browsers like Brave`

## Tech stack
  
  - Typescript
  - React + TailwindCSS
  - Nodejs
  - Docker
  - Vercel
  - Netlify
  - MongoDB

  Note: Node v20 and above

## API Plan

### Feature #1 — Bi-Directional Contact Sync

|       Direction        |             API                       |               Why                           |
|------------------------|---------------------------------------|---------------------------------------------|
| Wix → HubSpot (create) | `POST /crm/v3/objects/contacts`       | Create HubSpot contact from new Wix contact |
| Wix → HubSpot (update) | `PATCH /crm/v3/objects/contacts/{id}` | Update HubSpot contact properties           |
| HubSpot → Wix (create) | `POST /contacts/v4/contacts`          | Create Wix contact from HubSpot contact     |
| HubSpot → Wix (update) | `PATCH /contacts/v4/contacts/{id}`    | Update Wix contact                          |
| HubSpot Properties     | `GET /crm/v3/properties/contacts`     | Load all HubSpot properties for mapping UI |
| HubSpot Webhooks | HubSpot App → Webhooks settings | Receive `contact.creation` / `contact.propertyChange` |
| Wix Webhooks          | Wix Dev Center → App Webhooks         | Receive `CONTACT_CREATED`, `CONTACT_UPDATED` |

**Loop Prevention:** Each sync write is tagged with a UUID correlation ID stored in a 30-second dedup cache. Incoming webhooks check this cache — if the ID matches a recent write → skip. Also uses idempotency check (skip if values identical) and "last updated wins" conflict resolution.

### Feature #2 — Form & Lead Capture

|      Step               |         API              |           Why                                         |
|-------------------------|--------------------------|-------------------------------------------------------|
| Capture form submission | `POST /api/forms/submit` | Receive Wix form data + UTM params                    |
| Upsert HubSpot contact | `POST /crm/v3/objects/contacts` with email idProperty | Create or update by email |
| Store UTM attribution  | Custom HubSpot properties | `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `form_page_url`, `form_referrer`, `form_submitted_at`                                         |

## Quick Start

```bash
git clone https://github.com/Levy-Naibei/wix-hubspot-sync
cd wix-hubspot-sync
cp .env.example .env   # fill in values

Note: backend code: checkout to `render-deploy` branch

# local
cd backend && npm install && npm run dev
cd frontend && npm install && npm run dev

# or Docker
docker-compose up --build

```

## Wix App Registration

1. Go to [Wix Dev Center](https://dev.wix.com) → **Create App** → **Self Hosted App**
2. Set App URL to your deployed backend
3. Add Dashboard Component → `https://your-domain.com/dashboard`
4. Permissions: `Contacts: Read & Write`, `Forms: Read`, `Site URL: Read`
5. Webhooks: `CONTACT_CREATED`, `CONTACT_UPDATED` → `https://your-domain.com/api/webhooks/wix`
6. Copy App ID + Secret to `.env`

## HubSpot App Setup

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com) → Create App
2. OAuth → Add redirect URI: `https://your-domain.com/api/auth/hubspot/callback`
3. Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.schemas.contacts.read`,
            `crm.objects.leads.read`, `crm.objects.leads.write`, `oauth`
4. Webhooks → Subscribe to `contact.creation`, `contact.propertyChange`
5. Copy Client ID, Client Secret, App ID to `.env`

## MongoDB Atlas Setup

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → Create a free M0 cluster
2. **Database Access** → Add a database user with read/write permissions
3. **Network Access** → Add `0.0.0.0/0` (or your server IP) to the IP allowlist
4. **Connect** → Choose "Connect your application" → copy the connection string
5. Paste into `.env` as `MONGODB_URI`, replacing `<password>` with your user password


### Collections created automatically on first run

|     Collection    |          Purpose                                                         |
|-------------------|--------------------------------------------------------------------------|
| `tokens`          | Encrypted HubSpot OAuth tokens per site                                  |
| `contactmappings` | WixContactId ↔ HubSpotContactId pairs                                    |
| `fieldmappings`   | User-configured field mapping rules per site                             |
| `synclogs`        | Audit log of every sync event (auto-expires after 90 days via TTL index) |