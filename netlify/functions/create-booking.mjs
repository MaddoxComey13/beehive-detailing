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

// Mirrors booking.js's tier model exactly -- this is what actually prices
// the real Jobber request, so it must never trust the client's own total.
const PACKAGE_LABELS = {
  interior: { label: 'Interior Only', price: 144 },
  bronze: { label: 'Bronze', price: 184 },
  gold: { label: 'Gold', price: 239 },
  diamond: { label: 'Diamond', price: 279 },
};

const EXTERIOR_PACKAGES = new Set(['bronze', 'gold', 'diamond']);
const VEHICLE_SIZE_DISCOUNT = { interior: 0, bronze: 0, gold: 0.10, diamond: 0.20 };

const VEHICLE_LABELS = {
  standard: { label: 'Standard', price: 0 },
  midsize: { label: 'Midsize', price: 20 },
  suv: { label: 'SUV', price: 30 },
  truck: { label: 'Truck', price: 40 },
};

function vehiclePrice(sizeId, pkgId) {
  const base = VEHICLE_LABELS[sizeId].price;
  const discount = VEHICLE_SIZE_DISCOUNT[pkgId] || 0;
  return Math.round(base * (1 - discount));
}

const RADIO_ADDONS = {
  petHair: {
    label: 'Pet hair removal',
    options: { none: { label: 'None', price: 0 }, medium: { label: 'Medium', price: 30 }, heavy: { label: 'Heavy', price: 60 } },
    order: ['none', 'medium', 'heavy'],
    includedLevel: { gold: 'medium', diamond: 'heavy' },
  },
  odorRemoval: {
    label: 'Odor removal',
    options: { none: { label: 'None', price: 0 }, base: { label: 'Standard', price: 45 }, smoke: { label: 'Cigarette smoke', price: 60 } },
    order: ['none', 'base', 'smoke'],
    includedLevel: { diamond: 'base' },
  },
};

function radioOptionPrice(groupKey, optionId, pkgId) {
  const group = RADIO_ADDONS[groupKey];
  const option = group.options[optionId];
  const includedId = group.includedLevel[pkgId];
  if (!includedId) return option.price;
  const includedOption = group.options[includedId];
  const optionIdx = group.order.indexOf(optionId);
  const includedIdx = group.order.indexOf(includedId);
  if (optionIdx <= includedIdx) return 0;
  return option.price - includedOption.price;
}

const CHECKBOX_ADDON_LABELS = {
  stainRemoval: { label: 'Stain removal', price: 30, scope: 'interior', includedFrom: ['diamond'] },
  carpetShampoo: { label: 'Carpet shampoo', price: 30, scope: 'interior', includedFrom: ['gold', 'diamond'] },
  leatherConditioning: { label: 'Leather conditioning', price: 25, scope: 'interior', includedFrom: ['gold', 'diamond'] },
  headlinerCleaning: { label: 'Headliner cleaning', price: 35, scope: 'interior', includedFrom: [] },
  tireShine: { label: 'Tire shine', price: 20, scope: 'exterior', includedFrom: ['gold', 'diamond'] },
  engineCleaning: { label: 'Engine bay cleaning', price: 50, scope: 'exterior', includedFrom: ['diamond'] },
  bugTarRemoval: { label: 'Bug and tar removal', price: 25, scope: 'exterior', includedFrom: [] },
  headlightRestoration: { label: 'Headlight restoration (pair)', price: 40, scope: 'exterior', includedFrom: [] },
  truckBedDetail: { label: 'Truck bed detail', price: 20, scope: 'exterior', includedFrom: [] },
};

function checkboxAddonPrice(addon, pkgId) {
  return addon.includedFrom.includes(pkgId) ? 0 : addon.price;
}

function isVisibleForPackage(addon, pkgId) {
  return addon.scope !== 'exterior' || EXTERIOR_PACKAGES.has(pkgId);
}

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
  const pkgId = body.package;
  const pkg = PACKAGE_LABELS[pkgId];
  items.push(lineItem(pkg.label, pkg.price));

  const sizePrice = vehiclePrice(body.vehicleSize, pkgId);
  if (sizePrice > 0) {
    const size = VEHICLE_LABELS[body.vehicleSize];
    items.push(lineItem(`Vehicle size: ${size.label}`, sizePrice));
  }

  const addons = body.addons || {};
  ['petHair', 'odorRemoval'].forEach((groupKey) => {
    const selected = addons[groupKey];
    const group = RADIO_ADDONS[groupKey];
    if (!selected || selected === 'none' || !group.options[selected]) return;
    const price = radioOptionPrice(groupKey, selected, pkgId);
    const includedId = group.includedLevel[pkgId];
    const isIncluded = price === 0 && includedId;
    const label = `${group.label} (${group.options[selected].label})${isIncluded ? ' -- included' : ''}`;
    items.push(lineItem(label, price));
  });

  // Included items never appear in the client's `checkbox` selection array
  // (the UI shows them as a locked "Included" state, not a toggle), so we
  // surface every tier-included item explicitly here regardless of what
  // the client sent -- otherwise Maddox wouldn't see confirmation of what
  // the customer is actually getting.
  const selectedChecks = new Set(addons.checkbox || []);
  Object.entries(CHECKBOX_ADDON_LABELS).forEach(([id, a]) => {
    if (!isVisibleForPackage(a, pkgId)) return;
    const included = a.includedFrom.includes(pkgId);
    if (!included && !selectedChecks.has(id)) return;
    const price = checkboxAddonPrice(a, pkgId);
    const label = included ? `${a.label} -- included` : a.label;
    items.push(lineItem(label, price));
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
