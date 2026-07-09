// Called by booking.js on final submit. Creates a client, a property
// (the service address), and a request in Jobber -- in that order, since
// each step needs the ID from the one before it.
//
// Schema confirmed by hand against this account's live GraphiQL instance
// (Developer Center -> Test in GraphiQL -> Docs panel), July 2026:
//   - clientCreate:   ClientCreateInput { firstName, lastName, emails, phones }
//   - propertyCreate: PropertyCreateInput { properties: [PropertyAttributes!] }
//                      PropertyAttributes { address: AddressAttributes!, contactsToAssign: [EncodedId!] }
//                      (no direct clientId -- links via an existing contact's ID instead)
//   - requestCreate:  RequestCreateInput { clientId, propertyId, title, lineItems }
//                      RequestCreateLineItemAttributes { name, description, unitPrice, quantity, taxable, saveToProductsAndServices }

import { jobberGraphQL } from './lib/jobber.mjs';

const CLIENT_CREATE = `
  mutation CreateClient($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client {
        id
        contacts(first: 1) {
          edges { node { id } }
        }
      }
      userErrors { message path }
    }
  }
`;

const PROPERTY_CREATE = `
  mutation CreateProperty($clientId: EncodedId!, $input: PropertyCreateInput!) {
    propertyCreate(clientId: $clientId, input: $input) {
      properties { id }
      userErrors { message path }
    }
  }
`;

const REQUEST_CREATE = `
  mutation CreateRequest($input: RequestCreateInput!) {
    requestCreate(input: $input) {
      request { id }
      userErrors { message path }
    }
  }
`;

const PACKAGE_LABELS = {
  interior: { label: 'Interior Only', price: 144 },
  both: { label: 'Interior + Exterior', price: 184 },
};

const VEHICLE_LABELS = {
  standard: { label: 'Standard', price: 0 },
  midsize: { label: 'Midsize', price: 20 },
  suv: { label: 'SUV', price: 30 },
  truck: { label: 'Truck', price: 40 },
};

const PET_HAIR_LABELS = { medium: { label: 'Pet hair removal (medium)', price: 30 }, heavy: { label: 'Pet hair removal (heavy)', price: 60 } };
const ODOR_LABELS = { base: { label: 'Odor removal (standard)', price: 45 }, smoke: { label: 'Odor removal (cigarette smoke)', price: 60 } };

const CHECKBOX_ADDON_LABELS = {
  stainRemoval: { label: 'Stain removal', price: 30 },
  carpetShampoo: { label: 'Carpet shampoo', price: 30 },
  tireShine: { label: 'Tire shine', price: 20 },
  leatherConditioning: { label: 'Leather conditioning', price: 25 },
  engineCleaning: { label: 'Engine bay cleaning', price: 50 },
  headlinerCleaning: { label: 'Headliner cleaning', price: 35 },
  bugTarRemoval: { label: 'Bug & tar removal', price: 25 },
  clayBarDecon: { label: 'Clay bar paint decontamination', price: 40 },
  headlightRestoration: { label: 'Headlight restoration (pair)', price: 40 },
  wheelIronDecon: { label: 'Wheel & iron decontamination', price: 25 },
  trunkCargoDetail: { label: 'Trunk / cargo area detail', price: 20 },
};

const TIME_WINDOW_LABELS = {
  morning: '10:00 AM – 12:00 PM',
  midday: '12:00 PM – 2:00 PM',
  afternoon: '2:00 PM – 4:00 PM',
  lateafternoon: '4:00 PM – 6:00 PM',
};

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts.shift() || fullName;
  const lastName = parts.join(' ') || '-';
  return { firstName, lastName };
}

function validatePayload(body) {
  const required = ['package', 'vehicleSize', 'date', 'timeWindow', 'address', 'contact', 'total'];
  for (const field of required) {
    if (!body[field]) throw new Error(`Missing field: ${field}`);
  }
  if (!PACKAGE_LABELS[body.package]) throw new Error(`Unknown package: ${body.package}`);
  if (!VEHICLE_LABELS[body.vehicleSize]) throw new Error(`Unknown vehicle size: ${body.vehicleSize}`);
  const addr = body.address;
  if (!addr.line1 || !addr.city || !addr.zip) throw new Error('Incomplete address.');
  const contact = body.contact;
  if (!contact.fullName || !contact.phone || !contact.email) throw new Error('Incomplete contact info.');
}

function buildLineItems(body) {
  const items = [];
  const pkg = PACKAGE_LABELS[body.package];
  items.push(lineItem(pkg.label, pkg.price));

  const size = VEHICLE_LABELS[body.vehicleSize];
  if (size.price > 0) items.push(lineItem(`Vehicle size: ${size.label}`, size.price));

  const addons = body.addons || {};
  if (addons.petHair && PET_HAIR_LABELS[addons.petHair]) {
    const a = PET_HAIR_LABELS[addons.petHair];
    items.push(lineItem(a.label, a.price));
  }
  if (addons.odorRemoval && ODOR_LABELS[addons.odorRemoval]) {
    const a = ODOR_LABELS[addons.odorRemoval];
    items.push(lineItem(a.label, a.price));
  }
  (addons.checkbox || []).forEach((id) => {
    const a = CHECKBOX_ADDON_LABELS[id];
    if (a) items.push(lineItem(a.label, a.price));
  });

  // $0 informational line item so the preferred date/window is visible
  // alongside the priced items when Maddox reviews the request in Jobber.
  const windowLabel = TIME_WINDOW_LABELS[body.timeWindow] || body.timeWindow;
  items.push({
    name: 'Preferred arrival',
    description: `${body.date}, ${windowLabel}`,
    unitPrice: 0,
    quantity: 1,
    taxable: false,
    saveToProductsAndServices: false,
  });

  return items;
}

function lineItem(name, unitPrice) {
  return { name, unitPrice, quantity: 1, taxable: true, saveToProductsAndServices: false };
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
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
        // The client's own emails/phones above are just scalar fields --
        // propertyCreate links via an actual Contact record, so we need to
        // explicitly create one here too (confirmed via GraphiQL: ClientCreateInput.contacts).
        contacts: [{
          firstName,
          lastName,
          emails: [{ description: 'MAIN', primary: true, address: body.contact.email }],
          phones: [{ description: 'MAIN', primary: true, number: body.contact.phone }],
        }],
      },
    });
    if (clientResult.clientCreate.userErrors?.length) {
      throw new Error(`Jobber rejected client: ${JSON.stringify(clientResult.clientCreate.userErrors)}`);
    }
    const clientId = clientResult.clientCreate.client.id;
    const contactId = clientResult.clientCreate.client.contacts.edges[0]?.node?.id;
    if (!contactId) throw new Error('Client was created but has no contact to attach the property to.');

    const propertyResult = await jobberGraphQL(PROPERTY_CREATE, {
      clientId,
      input: {
        properties: [{
          address: {
            street1: body.address.line1,
            street2: body.address.line2 || undefined,
            city: body.address.city,
            province: body.address.state || 'UT',
            postalCode: body.address.zip,
            country: 'US',
          },
          contactsToAssign: [contactId],
        }],
      },
    });
    if (propertyResult.propertyCreate.userErrors?.length) {
      throw new Error(`Jobber rejected property: ${JSON.stringify(propertyResult.propertyCreate.userErrors)}`);
    }
    const propertyId = propertyResult.propertyCreate.properties[0]?.id;
    if (!propertyId) throw new Error('Property creation returned no ID.');

    const pkg = PACKAGE_LABELS[body.package];
    const size = VEHICLE_LABELS[body.vehicleSize];
    const requestResult = await jobberGraphQL(REQUEST_CREATE, {
      input: {
        clientId,
        propertyId,
        title: `${pkg.label} — ${size.label} — Beehive Detailing booking form`,
        lineItems: buildLineItems(body),
      },
    });
    if (requestResult.requestCreate.userErrors?.length) {
      throw new Error(`Jobber rejected request: ${JSON.stringify(requestResult.requestCreate.userErrors)}`);
    }
    const requestId = requestResult.requestCreate.request.id;

    return json({ ok: true, clientId, propertyId, requestId });
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
