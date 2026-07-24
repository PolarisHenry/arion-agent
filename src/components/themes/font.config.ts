import localFont from 'next/font/local';
import { cn } from '@/lib/utils';

const fontSans = localFont({
  src: './fonts/geist.woff2',
  variable: '--font-sans',
  weight: '100 900',
  display: 'swap'
});

const fontMono = localFont({
  src: './fonts/geist-mono.woff2',
  variable: '--font-mono',
  weight: '100 900',
  display: 'swap'
});

const fontInstrument = localFont({
  src: './fonts/instrument-sans.woff2',
  variable: '--font-instrument',
  weight: '400 700',
  display: 'swap'
});

const fontNotoMono = localFont({
  src: './fonts/noto-sans-mono.woff2',
  variable: '--font-noto-mono',
  weight: '100 900',
  display: 'swap'
});

const fontMullish = localFont({
  src: './fonts/mulish.woff2',
  variable: '--font-mullish',
  weight: '200 1000',
  display: 'swap'
});

const fontInter = localFont({
  src: './fonts/inter.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap'
});

const fontArchitectsDaughter = localFont({
  src: './fonts/architects-daughter-400.woff2',
  variable: '--font-architects-daughter',
  weight: '400',
  display: 'swap'
});

const fontDMSans = localFont({
  src: './fonts/dm-sans.woff2',
  variable: '--font-dm-sans',
  weight: '100 1000',
  display: 'swap'
});

const fontFiraCode = localFont({
  src: './fonts/fira-code.woff2',
  variable: '--font-fira-code',
  weight: '300 700',
  display: 'swap'
});

const fontOutfit = localFont({
  src: './fonts/outfit.woff2',
  variable: '--font-outfit',
  weight: '100 900',
  display: 'swap'
});

const fontSpaceMono = localFont({
  src: [
    { path: './fonts/space-mono-400.woff2', weight: '400' },
    { path: './fonts/space-mono-700.woff2', weight: '700' }
  ],
  variable: '--font-space-mono',
  display: 'swap'
});

const fontJetBrainsMono = localFont({
  src: './fonts/jetbrains-mono.woff2',
  variable: '--font-jetbrains-mono',
  weight: '100 800',
  display: 'swap'
});

const fontMerriweather = localFont({
  src: [
    { path: './fonts/merriweather-300.woff2', weight: '300' },
    { path: './fonts/merriweather-400.woff2', weight: '400' },
    { path: './fonts/merriweather-700.woff2', weight: '700' }
  ],
  variable: '--font-merriweather',
  display: 'swap'
});

const fontPlayfairDisplay = localFont({
  src: './fonts/playfair-display.woff2',
  variable: '--font-playfair-display',
  weight: '400 900',
  display: 'swap'
});

export const fontVariables = cn(
  fontSans.variable,
  fontMono.variable,
  fontInstrument.variable,
  fontNotoMono.variable,
  fontMullish.variable,
  fontInter.variable,
  fontArchitectsDaughter.variable,
  fontDMSans.variable,
  fontFiraCode.variable,
  fontOutfit.variable,
  fontSpaceMono.variable,
  fontJetBrainsMono.variable,
  fontMerriweather.variable,
  fontPlayfairDisplay.variable
);
