'use client';

import AccountShell from '../AccountShell';
import { FavoritesSection } from '../AccountSections';

export default function FavoritesPage() {
  return (
    <AccountShell title={{ en: 'Favorites', es: 'Favoritos' }}>
      <FavoritesSection />
    </AccountShell>
  );
}
