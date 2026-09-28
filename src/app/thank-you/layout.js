import ShopperApprovedSurvey from '@/components/ShopperApprovedSurvey';
import { shopperApprovedConfig } from '@/lib/shopperApproved.mjs';

/**
 * The thank-you page is the only place the survey token is handed to the
 * browser. The token is read here, on the server, from the environment. It is
 * not written in this file.
 */
export default function ThankYouLayout({ children }) {
  const config = shopperApprovedConfig();

  return (
    <>
      {children}
      {config ? <ShopperApprovedSurvey siteId={config.siteId} token={config.token} /> : null}
    </>
  );
}
