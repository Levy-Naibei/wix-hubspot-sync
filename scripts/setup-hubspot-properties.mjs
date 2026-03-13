#!/usr/bin/env node
/**
 * setup-hubspot-properties.mjs
 *
 * Run this once after OAuth to create required custom HubSpot contact properties.
 * These properties are used for sync metadata and UTM attribution.
 *
 * Usage:
 *   ACCESS_TOKEN=your_token node scripts/setup-hubspot-properties.mjs
 */

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('ERROR: ACCESS_TOKEN env var is required');
  process.exit(1);
}

const PROPERTIES = [
  // ── Sync metadata properties ──────────────────────────────────────────────
  {
    name: 'wix_contact_id',
    label: 'Wix Contact ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'The corresponding Wix contact ID for this HubSpot contact.',
  },
  {
    name: 'wix_sync_correlation_id',
    label: 'Wix Sync Correlation ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'UUID of the last sync operation. Used to prevent ping-pong loops.',
  },
  {
    name: 'wix_sync_source',
    label: 'Wix Sync Source',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'Origin of the last sync: wix, hubspot, or form.',
  },

  // ── UTM Attribution properties ────────────────────────────────────────────
  {
    name: 'utm_source',
    label: 'UTM Source',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'UTM source from form submission (e.g. google, newsletter).',
  },
  {
    name: 'utm_medium',
    label: 'UTM Medium',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'UTM medium from form submission (e.g. cpc, email).',
  },
  {
    name: 'utm_campaign',
    label: 'UTM Campaign',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'UTM campaign name from form submission.',
  },
  {
    name: 'utm_term',
    label: 'UTM Term',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'UTM search term from form submission.',
  },
  {
    name: 'utm_content',
    label: 'UTM Content',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'UTM content variant from form submission.',
  },

  // ── Form context properties ────────────────────────────────────────────────
  {
    name: 'form_page_url',
    label: 'Form Page URL',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'URL of the page where the form was submitted.',
  },
  {
    name: 'form_referrer',
    label: 'Form Referrer',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'Referrer URL when the form was submitted.',
  },
  {
    name: 'form_submitted_at',
    label: 'Form Submitted At',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'ISO 8601 timestamp of when the Wix form was submitted.',
  },
  {
    name: 'wix_form_id',
    label: 'Wix Form ID',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'ID of the Wix form that captured this contact.',
  },
  {
    name: 'wix_form_name',
    label: 'Wix Form Name',
    type: 'string',
    fieldType: 'text',
    groupName: 'contactinformation',
    description: 'Name of the Wix form that captured this contact.',
  },
];

async function createProperty(property) {
  const resp = await fetch('https://api.hubapi.com/crm/v3/properties/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(property),
  });

  if (resp.status === 409) {
    console.log(`  ⚠️  Already exists: ${property.name}`);
    return;
  }

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`  ❌ Failed to create ${property.name}: ${err}`);
    return;
  }

  console.log(`  ✅ Created: ${property.name}`);
}

console.log('Setting up HubSpot custom properties for Wix integration...\n');

for (const prop of PROPERTIES) {
  await createProperty(prop);
}

console.log('\nDone! All custom properties are ready.');
