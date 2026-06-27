'use client';

import dynamic from 'next/dynamic';

const ExitIntentPopup = dynamic(() => import('@/components/ExitIntentPopup'), {
  ssr: false,
});

export default function DeferredClientWidgets() {
  return (
    <>
      <ExitIntentPopup />
    </>
  );
}
