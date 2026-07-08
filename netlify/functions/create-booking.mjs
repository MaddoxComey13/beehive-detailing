// Called by booking.js on final submit. Creates a client, a property
// (the service address), and a request in Jobber.
//
// STATUS: clientCreate below is verified against Jobber's public docs.
// propertyCreate/requestCreate are NOT yet verified -- see the TODO block.
// Do not deploy this live until that's filled in and tested end-to-end.

import { jobberGraphQL } from './lib/jobber.mjs';

const CLIENT_CREATE = `
  mutation CreateClient($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client { id }
      userErrors { message path }
    }
  }
`;

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() || fullName;
  const lastName = parts.join(' ') || '-';
  return { firstName, lastName };
}

function addonSummaryLines(addons) {
  const lines = [];
  if (addons.petHair && addons.petHair !== 'none') lines.push(`Pet hair removal: ${addons.petHair}`);
  if (addons.odorRemoval && addons.odorRemoval !== 'none') lines.push(`Odor removal: ${addons.odorRemoval}`);
  (addons.checkbox || []).forEach((id) => lines.push(`Add-on: ${id}`));
  return lines;
}

function validatePayload(body) {
  const required = ['package', 'vehicleSize', 'date', 'timeWindow', 'address', 'contact', 'total'];
  for (const field of required) {
    if (!body[field]) throw new Error(`Missing field: ${field}`);
  }
  const addr = body.address;
  if (!addr.line1 || !addr.city || !addr.zip) throw new Error('Incomplete address.');
  const contact = body.contact;
  if (!contact.fullName || !contact.phone || !contact.email) throw new Error('Incomplete contact info.');
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
    validatePayload(body);
  } catch (err) {
    return json({ ok: false, error: `Invalid request: ${err.message}` }, 400);
  }

  try {
    const { firstName, lastName } = splitName(body.contact.fullName);

    const clientResult = await jobberGraphQL(CLIENT_CREATE, {
      input: {
        firstName,
        lastName,
        emails: [{ description: 'MAIN', primary: true, address: body.contact.email }],
        phones: [{ description: 'MAIN', primary: true, number: body.contact.phone }],
      },
    });

    if (clientResult.clientCreate.userErrors?.length) {
      throw new Error(`Jobber rejected client: ${JSON.stringify(clientResult.clientCreate.userErrors)}`);
    }
    const clientId = clientResult.clientCreate.client.id;

    // ------------------------------------------------------------------
    // TODO (blocked on confirming exact schema in your GraphiQL):
    //
    // 1. Create the property (service address) under this client.
    //    Open GraphiQL (Developer Center -> your app -> Test in GraphiQL),
    //    open the schema docs panel, and look up the mutation that creates
    //    a property/address for a client (likely named something like
    //    `propertyCreate` or `clientPropertyCreate`). Paste me its input
    //    type fields and I'll wire it in here using:
    //      body.address.line1, body.address.line2, body.address.city,
    //      body.address.state ("UT"), body.address.zip
    //
    // 2. Create the request tied to clientId (+ the new propertyId),
    //    using `requestCreate` (confirm exact input fields in GraphiQL).
    //    The request's notes/instructions should include:
    //      - package: body.package
    //      - vehicleSize: body.vehicleSize
    //      - addonSummaryLines(body.addons)
    //      - preferred date/window: body.date, body.timeWindow
    //      - total: body.total
    //
    // Until both are wired in, this function stops after creating the
    // client so nothing half-broken reaches your live Jobber account.
    // ------------------------------------------------------------------

    return json({
      ok: false,
      error: 'Client created, but property/request creation is not wired up yet (see TODO in create-booking.mjs).',
      clientId,
    }, 501);
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: err.message }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
