'use client';

import AccountShell from '../AccountShell';
import { ReferralSection } from '../AccountSections';

export default function ReferralPage() {
  return (
    <AccountShell title={{ en: 'Referrals', es: 'Referidos' }}>
      <ReferralSection />
    </AccountShell>
  );
}
