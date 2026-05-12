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
        <!-- Subtotal section: appears only on first page, not repeated on subsequent pages -->
        <div class="service-group-subtotal-section">
          <div class="service-group-header-initial">
            <div>
              <h3>${group?.icon || ''} ${group?.title || 'Service Group'}</h3>
              <p>${group?.subtitle || 'Studio booking services'}</p>
            </div>
            <div class="service-group-subtotal">${subtotalLabel}</div>
          </div>
        </div>
        
        <table class="service-table" role="presentation">
          <!-- Repeating header: appears on each page, but without the subtotal -->
          <thead class="service-group-head">
            <tr>
              <th colspan="3">
                <div class="service-group-header-repeat">
                  <div>
                    <h3>${group?.icon || ''} ${group?.title || 'Service Group'}</h3>
                    <p>${group?.subtitle || 'Studio booking services'}</p>
                  </div>
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
