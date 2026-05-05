(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.JamRoomQuotationBilling = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

    const getServiceGroupingConfig = (config = {}) => {
        const groups = (Array.isArray(config?.groups) ? config.groups : [])
            .map((group, index) => ({
                key: String(group?.key || '').trim().toLowerCase(),
                icon: String(group?.icon || '').trim(),
                title: String(group?.title || '').trim(),
                subtitle: String(group?.subtitle || '').trim(),
                order: Number.isFinite(Number(group?.order)) ? Number(group.order) : ((index + 1) * 10)
            }))
            .filter((group) => group.key && group.title)
            .sort((left, right) => left.order - right.order);

        const rules = (Array.isArray(config?.categoryRules) ? config.categoryRules : [])
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

        const resolvedRentalType = normalizeRentalType(item?.rentalType);
        let fallbackGroupKey = normalizedConfig.defaultGroupKey;
        if (['persession', 'pertrack'].includes(resolvedRentalType)) {
            fallbackGroupKey = normalizedConfig.groupKeys.includes('production') ? 'production' : normalizedConfig.defaultGroupKey;
        } else if (resolvedRentalType === 'perday') {
            fallbackGroupKey = normalizedConfig.groupKeys.includes('perday-rentals') ? 'perday-rentals' : normalizedConfig.defaultGroupKey;
        }

        return {
            groupKey: fallbackGroupKey,
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

    return {
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
}));
