'use client';

import AccountShell from '../AccountShell';
import { RewardsSection } from '../AccountSections';

export default function RewardsPage() {
  return (
    <AccountShell title={{ en: 'Savings', es: 'Ahorros' }}>
      <RewardsSection />
    </AccountShell>
  );
}
