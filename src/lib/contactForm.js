// Opens the storefront Contáctenos dialog from anywhere.
//
// The dialog is mounted once in the root layout and listens for this event, so
// the ten public pages that used to link out to wa.me do not each need their
// own modal state threaded through them.

export const CONTACT_FORM_EVENT = 'peptides:open-contact-form';

export function openContactForm(source = 'contact_form') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONTACT_FORM_EVENT, { detail: { source } }));
}
