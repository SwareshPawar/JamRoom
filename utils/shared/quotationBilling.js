/**
 * Isomorphic quotation billing utilities.
 *
 * D-3 fix: This module was previously only available as a browser UMD bundle at
 * `public/js/shared/quotation-billing.js`. Server-side code (`utils/pdfHTMLTemplate.js`)
 * was requiring it directly from `public/`, violating the server/client boundary.
 *
 * This file is the canonical source for all quotation billing logic.
 * It has zero DOM dependencies and runs safely in both Node.js and browsers.
 *
 * `public/js/shared/quotation-billing.js` remains the browser-facing bundle
 * and wraps this same logic in a UMD pattern for backward compatibility.
 */

const normalizeRentalType = (value) => {
  const type = String(value || 'inhouse').trim().toLowerCase();
  const compactType = type.replace(/[\s_-]+/g, '');

  if (compactType === 'perday') return 'perday';
  if (compactType === 'persession' || compactType === 'session') return 'persession';
  if (compactType === 'pertrack' || compactType === 'track') return 'pertrack';
  return 'inhouse';
};

const getCount = (calculation, rentalType) => {
  if (rentalType === 'perday') {
    return Number(calculation?.perdayDays || 0);
  }
  if (rentalType === 'persession') {
    return 1;
  }
  if (rentalType === 'pertrack') {
    return 1;
  }
  return Number(calculation?.inhouseDurationHours || 0);
};

const getQuotationBillingLabel = (rentalTypeInput, calculation = {}) => {
  const rentalType = normalizeRentalType(rentalTypeInput);
  if (rentalType === 'persession') {
    return 'Per session';
  }
  if (rentalType === 'pertrack') {
    const quantity = Number(calculation?.itemQuantity || 0);
    return quantity > 0 ? `Per track x ${quantity}` : 'Per track';
  }

  const count = getCount(calculation, rentalType);
  if (rentalType === 'perday') {
    return count > 0 ? `Per day x ${count}` : 'Per day';
  }

  return count > 0 ? `Per hour x ${count}` : 'Per hour';
};

const getQuotationItemAmount = (item = {}, calculation = {}) => {
  const rentalType = normalizeRentalType(item?.rentalType);
  const price = Number(item?.price || 0);
  const quantity = Number(item?.quantity || 0);

  if (rentalType === 'persession') {
    return price * quantity;
  }
  if (rentalType === 'pertrack') {
    return price * quantity;
  }

  const count = getCount(calculation, rentalType);
  if (count <= 0) {
    return 0;
  }

  return price * quantity * count;
};

const isQuantityEnabled = (item = {}) => {
  if (item?.quantityEnabled === true) return true;
  if (item?.quantityEnabled === false) return false;

  // Backward-compatible fallback for older data without explicit quantityEnabled
  const rentalType = normalizeRentalType(item?.rentalType);
  if (rentalType === 'perday' || rentalType === 'persession' || rentalType === 'pertrack') return true;
  if (Number(item?.price || 0) === 0) return true;
  if ((String(item?.name || '').includes('IEM'))) return true;
  return false;
};

const QUOTATION_CHARGE_GROUPS = Object.freeze([
  Object.freeze({
    rentalType: 'inhouse',
    title: 'Hourly Charges (In-studio, billed per hour)'
  }),
  Object.freeze({
    rentalType: 'perday',
    title: 'Per-Day Rental Charges (Equipment, billed per day)'
  }),
  Object.freeze({
    rentalType: 'persession',
    title: 'Per Event Charges (Show, party, or project based)'
  }),
  Object.freeze({
    rentalType: 'pertrack',
    title: 'Per-Track Charges (Track-count based)'
  })
]);

const SERVICE_GROUP_META = Object.freeze({
  studio: Object.freeze({
    icon: '🎸',
    title: 'Studio Usage',
    subtitle: 'Room access, instruments, and in-studio equipment support'
  }),
  production: Object.freeze({
    icon: '🎧',
    title: 'Production Services',
    subtitle: 'Composition, arrangement, recording, and creative production support'
  }),
  finishing: Object.freeze({
    icon: '🎼',
    title: 'Finishing & Delivery',
    subtitle: 'Mixing, mastering, and final polish for release-ready output'
  }),
  'sound-design': Object.freeze({
    icon: '🎬',
    title: 'Sound Design',
    subtitle: 'Foley, textures, and custom effects for cinematic or visual work'
  })
});

const SERVICE_GROUP_ORDER = Object.freeze(['studio', 'production', 'finishing', 'sound-design']);

const classifyServiceItem = (item = {}) => {
  const rawName = String(item?.name || '').trim();
  const rawCategory = String(item?.category || '').trim();
  const nameLower = rawName.toLowerCase();
  const categoryLower = rawCategory.toLowerCase();
  const searchText = `${nameLower} ${categoryLower}`;

  if (/jamroom|jam room/.test(nameLower) || /^studio$/.test(nameLower.trim())) {
    return { groupKey: 'studio', title: rawName || 'JamRoom Studio', description: 'Professional in-studio room usage with monitoring, setup support, and a comfortable recording environment.', order: 10 };
  }
  if (/bass guitar/.test(searchText)) {
    return { groupKey: 'studio', title: rawName || 'Bass Guitar', description: 'Live bass instrument support for rehearsals, jams, and recording sessions.', order: 20 };
  }
  if (/keyboard|piano/.test(searchText)) {
    return { groupKey: 'studio', title: rawName || 'Keyboard', description: 'Keyboard setup for composing, rehearsing, and recording melodic parts.', order: 30 };
  }
  if (/guitar|amp|drum|mic|microphone|monitor|speaker|console|mixer/.test(searchText)) {
    return { groupKey: 'studio', title: rawName || 'Studio Equipment', description: 'Studio equipment support prepared for tracking, rehearsal, and live session needs.', order: 40 };
  }
  if (/studio/.test(categoryLower)) {
    return { groupKey: 'studio', title: rawName || 'Studio Service', description: rawCategory ? `${rawCategory} support for your session.` : 'In-studio support for tracking, rehearsal, and recording.', order: 45 };
  }
  if (/composition/.test(searchText)) {
    return { groupKey: 'production', title: rawName || 'Composition', description: 'Original music composition crafted around your creative brief, mood, and structure.', order: 50 };
  }
  if (/arrangement layering/.test(searchText)) {
    return { groupKey: 'production', title: rawName || 'Arrangement Enhancement', description: 'Enhancing the music with additional instrument layers and a fuller arrangement.', order: 60 };
  }
  if (/arrangement/.test(searchText)) {
    return { groupKey: 'production', title: rawName || 'Arrangement', description: 'Structuring and refining the song so the production feels complete and performance-ready.', order: 70 };
  }
  if (/recording|tracking|vocal|editing/.test(searchText)) {
    return { groupKey: 'production', title: rawName || 'Production Service', description: 'Hands-on recording and production support tailored to the session requirement.', order: 80 };
  }
  if (/stem mastering/.test(searchText)) {
    return { groupKey: 'finishing', title: rawName || 'Stem Mastering', description: 'Mastering from grouped stems for better tonal control, polish, and release-ready output.', order: 90 };
  }
  if (/mastering/.test(searchText)) {
    return { groupKey: 'finishing', title: rawName || 'Mastering', description: 'Final polish, loudness balance, and clarity tuning for a release-ready final version.', order: 100 };
  }
  if (/mix/.test(searchText)) {
    return { groupKey: 'finishing', title: rawName || 'Mixing', description: 'Balancing vocals and instruments for clarity, space, punch, and a polished sound.', order: 110 };
  }
  if (/foley|sound effect|sfx/.test(searchText)) {
    return { groupKey: 'sound-design', title: rawName || 'Foley / Sound Design', description: 'Custom sound effects and texture creation for scenes, visuals, or storytelling moments.', order: 120 };
  }

  return {
    groupKey: ['persession', 'pertrack'].includes(normalizeRentalType(item?.rentalType)) ? 'production' : 'studio',
    title: rawName || 'Custom Service',
    description: rawCategory
      ? `${rawCategory} support tailored to your quotation requirements.`
      : 'Professional audio support tailored to your quotation requirements.',
    order: 130
  };
};

const buildServiceGroupSummary = (items = [], calculation = {}) => {
  const map = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const meta = classifyServiceItem(item);
    const groupMeta = SERVICE_GROUP_META[meta.groupKey] || SERVICE_GROUP_META.production;
    const group = map.get(meta.groupKey) || {
      key: meta.groupKey,
      icon: groupMeta.icon,
      title: groupMeta.title,
      subtitle: groupMeta.subtitle,
      subtotal: 0,
      items: []
    };

    const amount = getQuotationItemAmount(item, calculation);
    const quantityEnabled = isQuantityEnabled(item);
    const rentalType = normalizeRentalType(item?.rentalType);
    group.items.push({
      key: String(item?.id || item?.fullId || item?.name || '') + `-${group.items.length}`,
      title: meta.title,
      description: String(item?.description || '').trim() || meta.description,
      category: String(item?.category || '').trim(),
      quantity: Number(item?.quantity || 0),
      quantityEnabled,
      rate: Number(item?.price || 0),
      billingLabel: getQuotationBillingLabel(item?.rentalType, {
        ...calculation,
        itemQuantity: Number(item?.quantity || 0)
      }),
      amount,
      order: meta.order,
      rentalType
    });

    group.subtotal += amount;
    map.set(meta.groupKey, group);
  });

  return SERVICE_GROUP_ORDER
    .map((key) => map.get(key))
    .filter(Boolean)
    .map((group) => ({
      ...group,
      items: group.items
        .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
        .map(({ order, ...item }) => item)
    }));
};

const getQuotationChargeGroups = () => QUOTATION_CHARGE_GROUPS.map((group) => ({ ...group }));

module.exports = {
  getQuotationBillingLabel,
  getQuotationItemAmount,
  getQuotationChargeGroups,
  getServiceGroupMeta: () => ({ ...SERVICE_GROUP_META }),
  classifyServiceItem,
  buildServiceGroupSummary
};
