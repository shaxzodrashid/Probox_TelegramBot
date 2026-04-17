import sharp from 'sharp';

export const PASSPORT_ROTATION_ANGLES = [0, 90, 180, 270] as const;

export interface PassportImageVariant {
  angle: number;
  buffer: Buffer;
  width: number;
  height: number;
}

export interface PassportImageVariantSet {
  metadata: {
    format?: string;
    width?: number;
    height?: number;
    orientation?: number;
  };
  variants: PassportImageVariant[];
}

export async function buildPassportImageVariants(
  imageBuffer: Buffer,
): Promise<PassportImageVariantSet> {
  const metadata = await sharp(imageBuffer, { failOn: 'none' }).metadata();
  const normalizedBuffer = await sharp(imageBuffer, { failOn: 'none' }).rotate().toBuffer();
  const variants: PassportImageVariant[] = [];

  for (const angle of PASSPORT_ROTATION_ANGLES) {
    const transformed =
      angle === 0
        ? sharp(normalizedBuffer, { failOn: 'none' })
        : sharp(normalizedBuffer, { failOn: 'none' }).rotate(angle);
    const { data, info } = await transformed.toBuffer({ resolveWithObject: true });

    variants.push({
      angle,
      buffer: data,
      width: info.width,
      height: info.height,
    });
  }

  return {
    metadata: {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      orientation: metadata.orientation,
    },
    variants,
  };
}
