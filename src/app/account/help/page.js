'use client';

import AccountShell from '../AccountShell';
import { HelpSection } from '../AccountSections';

export default function HelpPage() {
  return (
    <AccountShell title={{ en: 'Help', es: 'Ayuda' }}>
      <HelpSection />
    </AccountShell>
  );
}
