export const metadata = {
  title: 'Mi Cuenta | Peptides Costa Rica',
  description: 'Consulte sus pedidos, seguimiento de envíos y direcciones guardadas.',
  // The account area is private to the signed-in customer and has nothing for a
  // crawler to index.
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }) {
  return children;
}
