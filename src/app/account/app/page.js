'use client';

import AccountShell from '../AccountShell';
import { AppSection } from '../AccountSections';

export default function AppPage() {
  return (
    <AccountShell title={{ en: 'App', es: 'Aplicación' }}>
      <AppSection />
    </AccountShell>
  );
}
