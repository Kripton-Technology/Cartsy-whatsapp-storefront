/**
 * Client-side image compression adhering to Cartsy Section 8 specifications:
 * - Reject anything larger than 5 MB before compression
 * - Resize to a maximum of 1200 px on the longest side
 * - Convert to WebP (with JPEG fallback)
 * - Aim for under 200 KB target size
 */
export async function compressImage(
  file: File,
  maxDimension: number = 1200,
  maxRawBytes: number = 5 * 1024 * 1024,
  targetBytes: number = 200 * 1024
): Promise<File> {
  // 1. Size check
  if (file.size > maxRawBytes) {
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max allowed raw size is 5MB.`);
  }

  // If it's already an SVG, don't compress via canvas
  if (file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for processing'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Resize down to maxDimension if larger
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file); // fallback to original
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first, fallback to JPEG
        const tryFormat = (type: string, quality: number): Promise<Blob | null> =>
          new Promise((res) => canvas.toBlob(res, type, quality));

        const attemptCompression = async () => {
          let format = 'image/webp';
          let quality = 0.82;
          let blob = await tryFormat(format, quality);

          // Test if browser supports WebP output
          if (!blob || blob.type !== 'image/webp') {
            format = 'image/jpeg';
            blob = await tryFormat(format, quality);
          }

          // If blob is still larger than targetBytes and quality > 0.5, reduce quality slightly
          if (blob && blob.size > targetBytes) {
            const lowerQualityBlob = await tryFormat(format, 0.68);
            if (lowerQualityBlob) blob = lowerQualityBlob;
          }

          if (!blob) {
            resolve(file);
            return;
          }

          const extension = format === 'image/webp' ? '.webp' : '.jpg';
          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const compressedFile = new File([blob], `${baseName}${extension}`, {
            type: format,
            lastModified: Date.now(),
          });

          resolve(compressedFile);
        };

        attemptCompression().catch(() => resolve(file));
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
