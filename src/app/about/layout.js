export const metadata = {
  title: 'Our Story',
  description: 'Meet Joey Webster and Sean McCully and learn why they built a local source for documented research peptides in Costa Rica.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'Our Story | Peptides Costa Rica',
    description: 'A local business built by longtime training partners Joey Webster and Sean McCully.',
    url: '/about',
    images: ['/logo.png'],
  },
};

export default function AboutLayout({ children }) {
  return children;
}
