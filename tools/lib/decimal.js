'use strict';

// Observation quantities have no fixed precision in the decimalString schema.
// Compare their sums exactly; valuation-profile rounding remains separate.
function equalDecimalSums(left, right) {
  const parse = (value) => {
    if (typeof value !== 'string' || !/^-?[0-9]+(\.[0-9]+)?$/.test(value)) {
      throw new Error(`not a decimal string: ${value}`);
    }
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
    const coefficient = BigInt(whole + fraction) * (negative ? -1n : 1n);
    return { coefficient, scale: fraction.length };
  };
  const lhs = left.map(parse);
  const rhs = right.map(parse);
  const scale = [...lhs, ...rhs].reduce((max, value) => Math.max(max, value.scale), 0);
  const sum = (values) => values.reduce((total, value) =>
    total + value.coefficient * 10n ** BigInt(scale - value.scale), 0n);
  return sum(lhs) === sum(rhs);
}

module.exports = { equalDecimalSums };
