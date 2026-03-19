import { config } from '.';

export type DeepLinkSlug = 'aksiya_01' | 'aksiya_02' | 'aksiya_03' | 'aksiya_04';

export interface DeepLinkConfig {
  slug: DeepLinkSlug;
  messageKey: string;
  secondaryMessageKey?: string;
  ctaAction: 'application' | 'link' | 'none';
  url?: string;
  videoNotePath?: string;
}

const deepLinkConfig: Record<DeepLinkSlug, DeepLinkConfig> = {
  aksiya_01: {
    slug: 'aksiya_01',
    messageKey: 'promo_aksiya_01',
    ctaAction: 'link',
    url: 'https://www.instagram.com/reel/DVqQbGOCMQx/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==',
  },
  aksiya_02: {
    slug: 'aksiya_02',
    messageKey: 'promo_aksiya_02',
    ctaAction: 'none',
  },
  aksiya_03: {
    slug: 'aksiya_03',
    messageKey: 'promo_aksiya_03',
    ctaAction: 'none',
    videoNotePath: 'src/uploads/test.mp4',
  },
  aksiya_04: {
    slug: 'aksiya_04',
    messageKey: 'promo_aksiya_04_part1',
    secondaryMessageKey: 'promo_aksiya_04_part2',
    ctaAction: 'none',
    videoNotePath: 'src/uploads/test.mp4',
  },
};

export const getDeepLinkConfig = (slug: string): DeepLinkConfig | null => {
  const normalizedSlug = slug.trim().toLowerCase() as DeepLinkSlug;
  return deepLinkConfig[normalizedSlug] ?? null;
};

export const getAllDeepLinkConfigs = (): DeepLinkConfig[] => {
  return Object.values(deepLinkConfig);
};

export const buildDeepLinkUrl = (slug: DeepLinkSlug): string | null => {
  if (!config.BOT_USERNAME) return null;
  return `https://t.me/${config.BOT_USERNAME}?start=${slug}`;
};
