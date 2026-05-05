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

const DEFAULT_SERVICE_GROUPS = Object.freeze([
  Object.freeze({
    key: 'studio',
    icon: '🎸',
    title: 'Studio Usage',
    subtitle: 'Room access, instruments, and in-studio equipment support',
    order: 10
  }),
  Object.freeze({
    key: 'production',
    icon: '🎧',
    title: 'Production Services',
    subtitle: 'Composition, arrangement, recording, and creative production support',
    order: 20
  }),
  Object.freeze({
    key: 'finishing',
    icon: '🎼',
    title: 'Finishing & Delivery',
    subtitle: 'Mixing, mastering, and final polish for release-ready output',
    order: 30
  }),
  Object.freeze({
    key: 'sound-design',
    icon: '🎬',
    title: 'Sound Design',
    subtitle: 'Foley, textures, and custom effects for cinematic or visual work',
    order: 40
  })
]);

const DEFAULT_SERVICE_RULES = Object.freeze([
  Object.freeze({ groupKey: 'studio', title: 'JamRoom Studio', description: 'Professional in-studio room usage with monitoring, setup support, and a comfortable recording environment.', order: 10, matchField: 'name', keywords: ['jamroom', 'jam room'] }),
  Object.freeze({ groupKey: 'studio', title: 'Bass Guitar', description: 'Live bass instrument support for rehearsals, jams, and recording sessions.', order: 20, matchField: 'both', keywords: ['bass guitar'] }),
  Object.freeze({ groupKey: 'studio', title: 'Keyboard', description: 'Keyboard setup for composing, rehearsing, and recording melodic parts.', order: 30, matchField: 'both', keywords: ['keyboard', 'piano'] }),
  Object.freeze({ groupKey: 'studio', title: 'Studio Equipment', description: 'Studio equipment support prepared for tracking, rehearsal, and live session needs.', order: 40, matchField: 'both', keywords: ['guitar', 'amp', 'drum', 'mic', 'microphone', 'monitor', 'speaker', 'console', 'mixer'] }),
  Object.freeze({ groupKey: 'production', title: 'Composition', description: 'Original music composition crafted around your creative brief, mood, and structure.', order: 50, matchField: 'both', keywords: ['composition'] }),
  Object.freeze({ groupKey: 'production', title: 'Arrangement Enhancement', description: 'Enhancing the music with additional instrument layers and a fuller arrangement.', order: 60, matchField: 'both', keywords: ['arrangement layering'] }),
  Object.freeze({ groupKey: 'production', title: 'Arrangement', description: 'Structuring and refining the song so the production feels complete and performance-ready.', order: 70, matchField: 'both', keywords: ['arrangement'] }),
  Object.freeze({ groupKey: 'production', title: 'Production Service', description: 'Hands-on recording and production support tailored to the session requirement.', order: 80, matchField: 'both', keywords: ['recording', 'tracking', 'vocal', 'editing'] }),
  Object.freeze({ groupKey: 'finishing', title: 'Stem Mastering', description: 'Mastering from grouped stems for better tonal control, polish, and release-ready output.', order: 90, matchField: 'both', keywords: ['stem mastering'] }),
  Object.freeze({ groupKey: 'finishing', title: 'Mastering', description: 'Final polish, loudness balance, and clarity tuning for a release-ready final version.', order: 100, matchField: 'both', keywords: ['mastering'] }),
  Object.freeze({ groupKey: 'finishing', title: 'Mixing', description: 'Balancing vocals and instruments for clarity, space, punch, and a polished sound.', order: 110, matchField: 'both', keywords: ['mix'] }),
  Object.freeze({ groupKey: 'sound-design', title: 'Foley / Sound Design', description: 'Custom sound effects and texture creation for scenes, visuals, or storytelling moments.', order: 120, matchField: 'both', keywords: ['foley', 'sound effect', 'sfx'] })
]);

const getServiceGroupingConfig = (config = {}) => {
  const groupsInput = Array.isArray(config?.groups) && config.groups.length > 0
    ? config.groups
    : DEFAULT_SERVICE_GROUPS;

  const groups = groupsInput
    .map((group, index) => ({
      key: String(group?.key || '').trim().toLowerCase(),
      icon: String(group?.icon || '').trim(),
      title: String(group?.title || '').trim(),
      subtitle: String(group?.subtitle || '').trim(),
      order: Number.isFinite(Number(group?.order)) ? Number(group.order) : ((index + 1) * 10)
    }))
    .filter((group) => group.key && group.title)
    .sort((left, right) => left.order - right.order);

  const rulesInput = Array.isArray(config?.categoryRules) && config.categoryRules.length > 0
    ? config.categoryRules
    : DEFAULT_SERVICE_RULES;

  const rules = rulesInput
    .map((rule, index) => ({
      groupKey: String(rule?.groupKey || '').trim().toLowerCase(),
      title: String(rule?.title || '').trim(),
      description: String(rule?.description || '').trim(),
      order: Number.isFinite(Number(rule?.order)) ? Number(rule.order) : ((index + 1) * 10),
      matchField: ['name', 'category', 'both'].includes(String(rule?.matchField || '').toLowerCase())
        ? String(rule.matchField).toLowerCase()
        : 'both',
      keywords: (Array.isArray(rule?.keywords) ? rule.keywords : [])
        .map((keyword) => String(keyword || '').trim().toLowerCase())
        .filter(Boolean)
    }))
    .filter((rule) => rule.groupKey && rule.keywords.length > 0)
    .sort((left, right) => left.order - right.order);

  const catalogAssignments = (Array.isArray(config?.catalogAssignments) ? config.catalogAssignments : [])
    .map((entry) => ({
      groupKey: String(entry?.groupKey || '').trim().toLowerCase(),
      assignmentType: String(entry?.assignmentType || '').trim().toLowerCase() === 'subitem' ? 'subitem' : 'category',
      categoryName: String(entry?.categoryName || '').trim().toLowerCase(),
      itemName: String(entry?.itemName || '').trim().toLowerCase()
    }))
    .filter((entry) => entry.groupKey && (entry.assignmentType === 'category' ? entry.categoryName : (entry.categoryName && entry.itemName)));

  const defaultGroupKey = String(config?.defaultGroupKey || groups[0]?.key || 'studio').trim().toLowerCase();

  return {
    groups,
    rules,
    catalogAssignments,
    defaultGroupKey,
    groupKeys: groups.map((group) => group.key)
  };
};

const classifyServiceItem = (item = {}, config = {}) => {
  const rawName = String(item?.name || '').trim();
  const rawCategory = String(item?.category || '').trim();
  const nameLower = rawName.toLowerCase();
  const categoryLower = rawCategory.toLowerCase();
  const normalizedConfig = getServiceGroupingConfig(config);

  // Priority 1: explicit catalog assignments (admin-managed, no duplication)
  const matchedAssignment = normalizedConfig.catalogAssignments.find((entry) => {
    if (entry.assignmentType === 'category') {
      return entry.categoryName === categoryLower;
    }
    return entry.categoryName === categoryLower && entry.itemName === nameLower;
  });

  if (matchedAssignment) {
    return {
      groupKey: matchedAssignment.groupKey,
      title: rawName || 'Service',
      description: rawCategory
        ? `${rawCategory} support tailored to your quotation requirements.`
        : 'Professional service support tailored to your booking requirements.',
      order: 5
    };
  }

  // Priority 2: legacy keyword rules
  const matchedRule = normalizedConfig.rules.find((rule) => {
    const searchText = rule.matchField === 'name'
      ? nameLower
      : rule.matchField === 'category'
        ? categoryLower
        : `${nameLower} ${categoryLower}`;

    return rule.keywords.some((keyword) => searchText.includes(keyword));
  });

  if (matchedRule) {
    return {
      groupKey: matchedRule.groupKey,
      title: rawName || matchedRule.title || 'Service',
      description: matchedRule.description || 'Professional service support tailored to your booking requirements.',
      order: matchedRule.order
    };
  }

  return {
    groupKey: ['persession', 'pertrack'].includes(normalizeRentalType(item?.rentalType))
      ? (normalizedConfig.groupKeys.includes('production') ? 'production' : normalizedConfig.defaultGroupKey)
      : normalizedConfig.defaultGroupKey,
    title: rawName || 'Custom Service',
    description: rawCategory
      ? `${rawCategory} support tailored to your quotation requirements.`
      : 'Professional audio support tailored to your quotation requirements.',
    order: 130
  };
};

const buildServiceGroupSummary = (items = [], calculation = {}, config = {}) => {
  const normalizedConfig = getServiceGroupingConfig(config);
  const groupMetaMap = new Map(normalizedConfig.groups.map((group) => [group.key, group]));
  const groupOrder = normalizedConfig.groups.map((group) => group.key);
  const map = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const meta = classifyServiceItem(item, normalizedConfig);
    const groupMeta = groupMetaMap.get(meta.groupKey) || groupMetaMap.get(normalizedConfig.defaultGroupKey) || {
      key: normalizedConfig.defaultGroupKey,
      icon: '',
      title: 'Services',
      subtitle: 'Booking services'
    };
    const group = map.get(meta.groupKey) || {
      key: groupMeta.key,
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

  return groupOrder
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
  getServiceGroupMeta: (config = {}) => {
    const normalizedConfig = getServiceGroupingConfig(config);
    return normalizedConfig.groups.reduce((acc, group) => {
      acc[group.key] = {
        icon: group.icon,
        title: group.title,
        subtitle: group.subtitle
      };
      return acc;
    }, {});
  },
  classifyServiceItem,
  buildServiceGroupSummary
};
