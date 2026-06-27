import CatalogClient from './CatalogClient';
import { fetchCatalogProductsServer } from '@/lib/catalogProducts';

export const revalidate = 120;

export const metadata = {
  title: 'Peptides Costa Rica | Catálogo Premium',
  description:
    'Descubra nuestra selección premium de péptidos de investigación en Costa Rica. Alta pureza, descuentos por volumen y envíos garantizados.',
};

export default async function CatalogPage() {
  const { products, dbBacked } = await fetchCatalogProductsServer();

  return (
    <CatalogClient
      initialProducts={products.length > 0 ? products : null}
      initialDbBacked={dbBacked}
    />
  );
}
