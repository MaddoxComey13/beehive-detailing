// Jobber redirects here after you approve access in jobber-auth-start.
// Exchanges the authorization code for tokens and stores them in Netlify
// Blobs so create-booking.mjs can use them later.

import { exchangeCodeForTokens } from './lib/jobber.mjs';

function getCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = getCookie(req, 'jobber_oauth_state');

  if (!code) {
    return new Response('Missing authorization code from Jobber.', { status: 400 });
  }
  if (!state || state !== expectedState) {
    return new Response('State mismatch -- possible CSRF, or this link expired. Restart at /.netlify/functions/jobber-auth-start.', { status: 400 });
  }

  try {
    await exchangeCodeForTokens(code);
  } catch (err) {
    return new Response(`Failed to connect Jobber: ${err.message}`, { status: 500 });
  }

  return new Response(
    `<!doctype html><html><body style="font-family: system-ui; text-align: center; padding: 4rem;">
      <h1>Jobber connected ✅</h1>
      <p>Beehive Detailing's booking form can now create clients and requests in your Jobber account. You can close this tab.</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
};
