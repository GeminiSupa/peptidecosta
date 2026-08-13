export const ORDER_EMAIL_LOGO_URL = 'https://catalog.peptidescostarica.net/logo.png?v=2';
export const ORDER_EMAIL_LOGO_CID = 'peptides-costa-rica-logo@order-email';
export const ORDER_EMAIL_LOGO_SRC = `cid:${ORDER_EMAIL_LOGO_CID}`;

/**
 * Embed the logo in the MIME message instead of asking the recipient's mail
 * client to download it. Privacy-focused clients commonly block remote images.
 */
export function getOrderEmailLogoAttachment() {
  return {
    filename: 'peptides-costa-rica-logo.png',
    path: ORDER_EMAIL_LOGO_URL,
    cid: ORDER_EMAIL_LOGO_CID,
    contentDisposition: 'inline',
  };
}
