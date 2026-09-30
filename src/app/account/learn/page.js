'use client';

import AccountShell from '../AccountShell';
import { LearnSection } from '../AccountSections';

export default function LearnPage() {
  return (
    <AccountShell title={{ en: 'Learn', es: 'Aprender' }}>
      <LearnSection />
    </AccountShell>
  );
}
