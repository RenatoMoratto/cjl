import { Html, Head, Main, NextScript } from "next/document";

/** Absolute base for social-card URLs, without a trailing slash. */
const SITE_URL = "https://coraljovemlondrina.com.br";

// A small JPEG: link previews (WhatsApp in particular) skip large or WebP images
const SOCIAL_IMAGE_URL = `${SITE_URL}/images/og.jpg`;

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* Primary Meta Tags */}
        <meta charSet="UTF-8" />
        <meta name="author" content="Coral Jovem de Londrina" />
        <meta
          name="description"
          content="Com fé e propósito, damos voz à nossa missão. A mensagem do advento a todo mundo em nossa geração."
        />
        <meta
          name="keywords"
          content="Coral, Londrina, Música, Coral Jovem, CJL, Canto, Grupo Musical"
        />

        {/* Open Graph Meta Tags (For Social Media) */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Coral Jovem de Londrina" />
        <meta
          property="og:description"
          content="Com fé e propósito, damos voz à nossa missão. A mensagem do advento a todo mundo em nossa geração."
        />
        <meta property="og:image" content={SOCIAL_IMAGE_URL} />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="1205" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:site_name" content="Coral Jovem de Londrina" />

        {/* Twitter Card Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Coral Jovem de Londrina" />
        <meta
          name="twitter:description"
          content="Com fé e propósito, damos voz à nossa missão. A mensagem do advento a todo mundo em nossa geração."
        />
        <meta name="twitter:image" content={SOCIAL_IMAGE_URL} />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />

        {/* Installable app: name, icons and colors are in the manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="theme-color" content="#111827" />
        <meta name="apple-mobile-web-app-title" content="CJL" />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
