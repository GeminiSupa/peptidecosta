'use client';

import AccountShell from '../AccountShell';
import { NotificationsSection } from '../AccountSections';

export default function NotificationsPage() {
  return (
    <AccountShell title={{ en: 'Notifications', es: 'Avisos' }}>
      <NotificationsSection />
    </AccountShell>
  );
}
