/**
 * Wix Dashboard Extension — HubSpot Integration
 *
 * This file serves as the Wix Dashboard Page component.
 * It renders the React frontend app in the Wix Dashboard context.
 *
 * When the app is installed, Wix loads this page in the site owner's dashboard.
 * The `instance` query parameter is automatically appended by Wix and contains
 * a signed JWT with the site's context (siteId, instanceId, etc.)
 *
 * For self-hosted apps, this component simply renders an iframe or
 * redirects to the hosted dashboard app URL with the Wix instance token.
 *
 * Deployment: This file is served from your own server, not from Wix infrastructure.
 * The Wix Dashboard iframes this URL inside the site owner's dashboard.
 */

import { dashboard } from '@wix/dashboard';
import { httpClient } from '@wix/essentials';

/**
 * Called when the dashboard page loads.
 * We use the Wix SDK to get the current site context and pass it to
 * our React dashboard app.
 */
export async function initDashboard(): Promise<void> {
  // Get current site info from Wix SDK
  const siteInfo = await dashboard.getSiteInfo();

  // The main dashboard UI is our React app, served separately.
  // Wix automatically appends `instance` query param when loading the iframe.
  // Our React app reads `instance` from query params to authenticate API calls.

  // console.log('[HubSpot Integration] Dashboard initialized', {
  //   siteId: siteInfo?.siteId,
  //   locale: siteInfo?.locale,
  // });
}

/**
 * Wix Page Configuration
 *
 * The Dashboard Component URL (configured in Wix Dev Center) points to:
 * https://your-domain.com/?instance={instance}
 *
 * Wix automatically injects the `instance` JWT parameter.
 * Our Express backend verifies this JWT in the requireAuth middleware.
 */

/*
 * ─── Wix Form Submission Integration ─────────────────────────────────────────
 *
 * To capture Wix native form submissions and send them to HubSpot, add this
 * Velo backend code to your Wix site:
 *
 * // In Wix site's backend/events.js:
 *
 * import { fetch } from 'wix-fetch';
 *
 * export async function wixForms_onFormSubmit(event) {
 *   const { formId, submissionData } = event;
 *
 *   const fields = {};
 *   for (const field of submissionData.fields) {
 *     fields[field.fieldType] = field.value;
 *   }
 *
 *   await fetch('https://your-domain.com/api/forms/submit', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       siteId: 'YOUR_SITE_ID',
 *       email: fields.email,
 *       firstName: fields.firstName,
 *       lastName: fields.lastName,
 *       phone: fields.phone,
 *       formId: formId,
 *       // UTM params captured from page - pass from frontend
 *     }),
 *   });
 * }
 *
 * ─── OR use the JavaScript snippet from GET /api/forms/snippet ───────────────
 *
 * Add to Wix Page's Custom Code section:
 * <script src="https://your-domain.com/api/forms/snippet?siteId=YOUR_SITE_ID"></script>
 *
 * Then in your Wix form's onSubmit handler:
 * $w('#myForm').onSubmit(async (event) => {
 *   await window.wixHubSpotSubmit({
 *     email: event.target.fields['email'].value,
 *     firstName: event.target.fields['firstName'].value,
 *   });
 * });
 */
