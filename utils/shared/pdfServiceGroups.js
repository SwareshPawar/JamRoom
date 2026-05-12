const toArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Render service groups with print-safe table headers so each group header repeats on page breaks.
 * @param {Object} options
 * @param {Array} options.groups - Service groups with { title, subtitle, icon, subtotalLabel/subtotal, items[] }
 * @param {Function} options.renderRow - Function(item, group) => HTML row string
 * @returns {string}
 */
const renderServiceGroupSections = ({ groups, renderRow }) => {
  const safeGroups = toArray(groups);
  if (safeGroups.length === 0) {
    return '';
  }

  return safeGroups.map((group) => {
    const rows = toArray(group?.items).map((item) => renderRow(item, group)).join('');
    const subtotalLabel = group?.subtotalLabel || (Number.isFinite(Number(group?.subtotal)) ? `₹${Number(group.subtotal).toFixed(2)}` : '₹0.00');

    return `
      <section class="service-group">
        <table class="service-table" role="presentation">
          <thead class="service-group-head">
            <tr>
              <th colspan="3">
                <div class="service-group-header">
                  <div>
                    <h3>${group?.icon || ''} ${group?.title || 'Service Group'}</h3>
                    <p>${group?.subtitle || 'Studio booking services'}</p>
                  </div>
                  <div class="service-group-subtotal">${subtotalLabel}</div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody class="service-group-body">${rows}</tbody>
        </table>
      </section>`;
  }).join('');
};

module.exports = {
  renderServiceGroupSections
};
