"use client";

import { useEffect } from 'react';

export default function UTMTracker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('utm_campaign');
    const medium = params.get('utm_medium');
    const enrollmentId = params.get('journey_enrollment');
    const stepId = params.get('utm_content');

    if (campaignId) {
      // Save campaign_id to localStorage with an expiration date (30 days)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);
      
      const attributionData = {
        ...(medium === 'email' && params.get('utm_source') === 'journey'
          ? { journey_id: campaignId, journey_enrollment_id: enrollmentId, journey_step_id: stepId }
          : { campaign_id: campaignId }),
        expires: expirationDate.getTime()
      };
      
      localStorage.setItem('costa_attribution', JSON.stringify(attributionData));
    }
  }, []);

  return null;
}
