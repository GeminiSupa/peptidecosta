export const metadata = {
  title: 'About Peptides Costa Rica',
  description: 'Meet Joey Webster and Sean McCully and learn why they built a local Costa Rica source for documented research products, clear stock, and direct support.',
  keywords: ['Peptides Costa Rica about', 'research peptides Costa Rica', 'Joey Webster', 'Sean McCully', 'Costa Rica peptide catalog'],
  alternates: {
    canonical: '/about',
    languages: {
      'en-US': '/about?lang=en',
      'es-CR': '/about?lang=es',
    },
  },
  openGraph: {
    title: 'About Peptides Costa Rica',
    description: 'A Costa Rica business built around local availability, batch documentation, and direct bilingual support.',
    url: '/about',
    images: [
      {
        url: '/science_lab_about.webp',
        width: 1200,
        height: 630,
        alt: 'Peptides Costa Rica local research product story',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Peptides Costa Rica',
    description: 'Local availability, batch documentation, and direct bilingual support in Costa Rica.',
    images: ['/science_lab_about.webp'],
  },
};

export default function AboutLayout({ children }) {
  return children;
}
