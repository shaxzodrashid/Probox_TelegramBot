import { config } from '.';

export type DeepLinkSlug = 'aksiya_01' | 'aksiya_02' | 'aksiya_03' | 'aksiya_04';

export interface DeepLinkConfig {
  slug: DeepLinkSlug;
  messageKey: string;
  secondaryMessageKey?: string;
  ctaAction: 'application' | 'link' | 'none';
  url?: string;
  mediaPlacement?: 'before_text' | 'after_primary_text' | 'between_texts';
  media?:
    | {
        type: 'video_note_file';
        path: string;
      }
    | {
        type: 'copy_message';
        fromChatId: number;
        messageId: number;
      };
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
    mediaPlacement: 'after_primary_text',
    media: {
      type: 'copy_message',
      fromChatId: -1003672668721,
      messageId: 420,
    },
  },
  aksiya_04: {
    slug: 'aksiya_04',
    messageKey: 'promo_aksiya_04_part1',
    secondaryMessageKey: 'promo_aksiya_04_part2',
    ctaAction: 'none',
    mediaPlacement: 'between_texts',
    media: {
      type: 'video_note_file',
      path: 'src/uploads/test.mp4',
    },
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
