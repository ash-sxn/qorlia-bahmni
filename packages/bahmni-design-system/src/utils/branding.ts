import { applyBahmniTheme, BAHMNI_DEFAULT_THEME } from './applyTheme';

export interface HospitalBranding {
  name: string;
  logoPath?: string;
  primary: string;
  primaryHover: string;
  canvas: string;
}

export const DEFAULT_BRANDING: HospitalBranding = {
  name: 'Qorlia',
  primary: '#1F5238',
  primaryHover: '#173E2B',
  canvas: '#F5F7F5',
};

let branding = DEFAULT_BRANDING;

const hexColor = /^#[0-9a-fA-F]{6}$/;
const localImagePath = /^\/(?!\/)[a-zA-Z0-9/_-]+\.(?:png|webp|svg)$/;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseHospitalBranding(value: unknown): HospitalBranding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Branding must be an object');
  }
  const input = value as Record<string, unknown>;
  const name = input.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 60) {
    throw new Error('Brand name must be 1 to 60 characters');
  }
  const colors = ['primary', 'primaryHover', 'canvas'] as const;
  for (const key of colors) {
    if (typeof input[key] !== 'string' || !hexColor.test(input[key])) {
      throw new Error(`${key} must be a six-digit hex color`);
    }
  }
  if (contrastRatio(input.primary as string, '#FFFFFF') < 4.5) {
    throw new Error('Primary color needs 4.5:1 contrast with white text');
  }
  if (contrastRatio(input.primaryHover as string, '#FFFFFF') < 4.5) {
    throw new Error('Hover color needs 4.5:1 contrast with white text');
  }
  if (contrastRatio(input.canvas as string, '#202321') < 4.5) {
    throw new Error('Canvas color needs 4.5:1 contrast with dark text');
  }
  if (
    input.logoPath !== undefined &&
    (typeof input.logoPath !== 'string' || !localImagePath.test(input.logoPath))
  ) {
    throw new Error('Logo must be a same-site PNG, WebP or SVG path');
  }
  return {
    name: name.trim(),
    logoPath: input.logoPath as string | undefined,
    primary: input.primary as string,
    primaryHover: input.primaryHover as string,
    canvas: input.canvas as string,
  };
}

export function getHospitalBranding(): HospitalBranding {
  return branding;
}

export function applyHospitalBranding(config: HospitalBranding): void {
  branding = config;
  applyBahmniTheme({
    ...BAHMNI_DEFAULT_THEME,
    'background-brand': config.primary,
    'button-primary': config.primary,
    'button-primary-hover': config.primaryHover,
    'button-primary-active': config.primaryHover,
    'button-tertiary': config.primary,
    'button-tertiary-hover': config.primaryHover,
    'button-tertiary-active': config.primaryHover,
    interactive: config.primary,
    focus: config.primary,
    'border-interactive': config.primary,
    'link-primary': config.primary,
    'link-primary-hover': config.primaryHover,
    'link-secondary': config.primaryHover,
    'layer-01': config.canvas,
  });
  document.documentElement.style.setProperty(
    '--qorlia-primary',
    config.primary,
  );
  document.documentElement.style.setProperty(
    '--qorlia-primary-hover',
    config.primaryHover,
  );
  document.documentElement.style.setProperty('--qorlia-canvas', config.canvas);
}
