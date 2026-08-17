/**
 * SAP Business One Document Type Mapper
 * Maps SAP TransType codes from OINM to human-readable document type names.
 * Centralised here so every controller/service uses the same mappings.
 */

const SAP_DOC_TYPES = {
  13: 'A/R Invoice',
  14: 'A/R Credit Memo',
  15: 'Delivery',
  16: 'Return',
  18: 'A/P Invoice',
  19: 'A/P Credit Memo',
  20: 'Goods Receipt PO',
  21: 'Goods Return',
  59: 'Goods Receipt',
  60: 'Goods Issue',
  67: 'Stock Transfer',
  69: 'Inventory Revaluation',
  162: 'Inventory Transfer Request',
  202: 'Production Order',
};

/**
 * Returns the human-readable SAP document type for a given TransType code.
 * @param {number} transType
 * @returns {string}
 */
function getSapDocumentType(transType) {
  return SAP_DOC_TYPES[transType] || `Other (${transType})`;
}

module.exports = { SAP_DOC_TYPES, getSapDocumentType };
