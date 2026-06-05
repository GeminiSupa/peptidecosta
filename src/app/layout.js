import { Montserrat, Inter } from "next/font/google";
import "./globals.css";
import ExitIntentPopup from "@/components/ExitIntentPopup";
import ChatWidget from "@/components/ChatWidget";

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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined') {
                  const nativeRemoveChild = Node.prototype.removeChild;
                  Node.prototype.removeChild = function(child) {
                    if (child.parentNode !== this) {
                      return child;
                    }
                    return nativeRemoveChild.apply(this, arguments);
                  };
                  const nativeInsertBefore = Node.prototype.insertBefore;
                  Node.prototype.insertBefore = function(newNode, referenceNode) {
                    if (referenceNode && referenceNode.parentNode !== this) {
                      return newNode;
                    }
                    return nativeInsertBefore.apply(this, arguments);
                  };
                }
              })();
            `
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ExitIntentPopup />
        <ChatWidget />
      </body>
    </html>
  );
}
