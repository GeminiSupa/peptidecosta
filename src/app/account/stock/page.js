'use client';

import AccountShell from '../AccountShell';
import { StockSection } from '../AccountSections';

export default function StockPage() {
  return (
    <AccountShell title={{ en: 'Back in stock', es: 'Cuando haya stock' }}>
      <StockSection />
    </AccountShell>
  );
}
