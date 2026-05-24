import { Montserrat, Inter } from "next/font/google";
import "./globals.css";
import ExitIntentPopup from "@/components/ExitIntentPopup";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata = {
  metadataBase: new URL('https://peptidescostarica.net'),
  title: "Peptides Costa Rica | Catálogo Premium",
  description: "Catálogo premium de péptidos para Peptides Costa Rica. Explore nuestra selección de alta calidad con precios y disponibilidad en tiempo real.",
  openGraph: {
    title: "Peptides Costa Rica | Catálogo Premium",
    description: "Catálogo premium de péptidos de alta calidad con precios y disponibilidad en tiempo real.",
    images: ['/logo.png'],
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/logo.png',
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1.0,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${montserrat.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ExitIntentPopup />
      </body>
    </html>
  );
}
