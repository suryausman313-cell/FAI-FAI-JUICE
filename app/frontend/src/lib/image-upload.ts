const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type CloudinaryUploadResponse = {
  secure_url?: string;
  error?: {
    message?: string;
  };
};

function getRequiredEnv(
  name:
    | 'VITE_CLOUDINARY_CLOUD_NAME'
    | 'VITE_CLOUDINARY_UPLOAD_PRESET',
): string {
  const value = String(import.meta.env[name] || '').trim();
  if (!value) {
    throw new Error(
      `${name} Cloudflare environment variable missing hai.`,
    );
  }
  return value;
}

export async function uploadMenuImage(file: File): Promise<string> {
  if (!file) {
    throw new Error('Pehle image select karein.');
  }

  if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Sirf JPG, PNG ya WEBP image upload karein.');
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image 10 MB se chhoti honi chahiye.');
  }

  const cloudName = getRequiredEnv('VITE_CLOUDINARY_CLOUD_NAME');
  const uploadPreset = getRequiredEnv(
    'VITE_CLOUDINARY_UPLOAD_PRESET',
  );

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(
      cloudName,
    )}/image/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const payload = (await response
    .json()
    .catch(() => null)) as CloudinaryUploadResponse | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Image upload failed (${response.status}).`,
    );
  }

  if (!payload?.secure_url) {
    throw new Error('Cloudinary ne image URL return nahi kiya.');
  }

  return payload.secure_url;
}
