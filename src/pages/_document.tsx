import { Html, Head, Main, NextScript } from "next/document";

/** Absolute base for social-card URLs, without a trailing slash. */
const SITE_URL = "https://coraljovemlondrina.com.br";

// A small JPEG: link previews (WhatsApp in particular) skip large or WebP images
const SOCIAL_IMAGE_URL = `${SITE_URL}/images/og.jpg`;

// iOS shows a blank screen while the installed app starts unless there is a
// launch image of the exact screen size. Android draws its own from the
// manifest. Portrait CSS size and pixel ratio; images in public/splash.
const SPLASH_SCREENS = [
  [375, 667, 2], // iPhone 8, SE 2/3
  [414, 736, 3], // iPhone 8 Plus
  [375, 812, 3], // iPhone X, XS, 11 Pro, 12/13 mini
  [414, 896, 2], // iPhone XR, 11
  [414, 896, 3], // iPhone XS Max, 11 Pro Max
  [390, 844, 3], // iPhone 12, 13, 14, 16e
  [428, 926, 3], // iPhone 12/13 Pro Max, 14 Plus
  [393, 852, 3], // iPhone 14 Pro, 15, 15 Pro, 16
  [430, 932, 3], // iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [402, 874, 3], // iPhone 16 Pro, 17, 17 Pro
  [420, 912, 3], // iPhone Air
  [440, 956, 3], // iPhone 16 Pro Max, 17 Pro Max
  [768, 1024, 2], // iPad 9.7", iPad mini 5
  [744, 1133, 2], // iPad mini 6+
  [810, 1080, 2], // iPad 10.2"
  [820, 1180, 2], // iPad 10th gen, iPad Air 4/5
  [834, 1112, 2], // iPad Air 3, iPad Pro 10.5"
  [834, 1194, 2], // iPad Pro 11"
  [834, 1210, 2], // iPad Pro 11" (M4)
  [1024, 1366, 2], // iPad Pro 12.9", iPad Air 13"
  [1032, 1376, 2], // iPad Pro 13" (M4)
].flatMap(([width, height, ratio]) =>
  (["portrait", "landscape"] as const).map((orientation) => {
    const [x, y] =
      orientation === "portrait"
        ? [width * ratio, height * ratio]
        : [height * ratio, width * ratio];
    return {
      href: `/splash/${x}x${y}.png`,
      media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`,
    };
  }),
);

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        {/* Primary Meta Tags */}
        <meta charSet="UTF-8" />
        {/* Chrome on Android sizes the page from the phone's text size */}
        <meta name="text-scale" content="scale" />
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
        {/* iOS has tied launch images to this tag; the manifest may not do */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {SPLASH_SCREENS.map(({ href, media }) => (
          <link
            key={href}
            rel="apple-touch-startup-image"
            href={href}
            media={media}
          />
        ))}
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
