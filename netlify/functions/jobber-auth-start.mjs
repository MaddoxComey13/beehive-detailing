// One-time setup route. Visit this URL once in your browser while logged
// into the Jobber account this app should manage:
//   https://<your-site>/.netlify/functions/jobber-auth-start
// It redirects you to Jobber to approve access, then jobber-auth-callback
// stores the resulting tokens. You should not need to run this again unless
// tokens are lost (e.g. Blobs store cleared).

import { buildAuthorizeUrl } from './lib/jobber.mjs';
import crypto from 'node:crypto';

export default async () => {
  const state = crypto.randomUUID();
  const authorizeUrl = buildAuthorizeUrl(state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl,
      // Short-lived cookie so the callback can verify this request
      // actually originated from us (basic CSRF protection).
      'Set-Cookie': `jobber_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};
