import { adminApi } from '../lib/api';
import { compressImage } from '../lib/imageCompression';

export function useStorage() {
    const uploadFile = async (file: File, bucket: string): Promise<string | null> => {
        try {
            // Compress on device before upload adhering to Section 8 limits
            const compressed = await compressImage(file);
            const folder = bucket === 'products' ? 'products' : 'branding';
            const uploaded = await adminApi.uploadImage(compressed, folder);
            return uploaded.url;
        } catch (error) {
            console.error('Error uploading file:', error);
            alert(error instanceof Error ? error.message : 'Error uploading file');
            return null;
        }
    };

    const deleteFile = async (_url: string, _bucket: string) => {
        // Cloudinary deletions require a public_id. Product rows keep that for
        // future cleanup jobs, but the current UI only replaces URLs.
    };

    return { uploadFile, deleteFile };
}
