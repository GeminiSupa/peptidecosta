export function sortProductsAlphabetically(products = []) {
  return [...products].sort((left, right) => String(left?.product || '').localeCompare(
    String(right?.product || ''),
    undefined,
    { sensitivity: 'base', numeric: true }
  ));
}
