"use client";

import { useEffect } from 'react';
import { isUuid } from '@/lib/orderAttribution.mjs';

export default function UTMTracker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('utm_campaign');
    const medium = params.get('utm_medium');
    const enrollmentId = params.get('journey_enrollment');
    const stepId = params.get('utm_content');

    // These end up in uuid columns on `orders`. The Share Links tab lets staff
    // type any campaign name they like, so a slug such as "tesa20_flash_sale"
    // would be stored here and then break checkout for the next 30 days.
    if (campaignId && !isUuid(campaignId)) {
      localStorage.removeItem('costa_attribution');
      return;
    }

    if (campaignId) {
      // Save campaign_id to localStorage with an expiration date (30 days)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);

      const attributionData = {
        ...(medium === 'email' && params.get('utm_source') === 'journey'
          ? {
              journey_id: campaignId,
              journey_enrollment_id: isUuid(enrollmentId) ? enrollmentId : null,
              journey_step_id: isUuid(stepId) ? stepId : null,
            }
          : { campaign_id: campaignId }),
        expires: expirationDate.getTime()
      };

      localStorage.setItem('costa_attribution', JSON.stringify(attributionData));
    }
  }, []);

  return null;
}
