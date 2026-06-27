export default function CatalogLoading() {
  return (
    <div className="catalog-skeleton" aria-busy="true" aria-label="Loading catalog">
      <div className="catalog-skeleton__header">
        <div className="catalog-skeleton__logo" />
        <div className="catalog-skeleton__chips">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="catalog-skeleton__chip" />
          ))}
        </div>
      </div>
      <div className="catalog-skeleton__grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="catalog-skeleton__card">
            <div className="catalog-skeleton__img" />
            <div className="catalog-skeleton__line catalog-skeleton__line--short" />
            <div className="catalog-skeleton__line" />
          </div>
        ))}
      </div>
    </div>
  );
}
