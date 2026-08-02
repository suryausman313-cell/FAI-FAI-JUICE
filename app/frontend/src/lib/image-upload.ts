const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_DATA_URL_LENGTH = 950_000;
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

function getOptionalEnv(
  name: 'VITE_CLOUDINARY_CLOUD_NAME' | 'VITE_CLOUDINARY_UPLOAD_PRESET',
): string {
  return String(import.meta.env[name] || '').trim();
}

async function uploadToCloudinary(
  file: File,
  cloudName: string,
  uploadPreset: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
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
      payload?.error?.message || `Image upload failed (${response.status}).`,
    );
  }

  if (!payload?.secure_url) {
    throw new Error('Cloudinary ne image URL return nahi kiya.');
  }

  return payload.secure_url;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image read nahi ho saki.'));
    };

    image.src = objectUrl;
  });
}

async function compressToDataUrl(file: File): Promise<string> {
  const image = await loadImage(file);
  const maxDimension = 900;
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
  );

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Browser image process nahi kar saka.');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/webp', quality);

  while (dataUrl.length > MAX_OUTPUT_DATA_URL_LENGTH && quality > 0.45) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/webp', quality);
  }

  if (dataUrl.length > MAX_OUTPUT_DATA_URL_LENGTH) {
    throw new Error(
      'Image abhi bhi bohat bari hai. Chhoti ya square image select karein.',
    );
  }

  return dataUrl;
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

  const cloudName = getOptionalEnv('VITE_CLOUDINARY_CLOUD_NAME');
  const uploadPreset = getOptionalEnv('VITE_CLOUDINARY_UPLOAD_PRESET');

  // Cloudinary configured ho to permanent URL use hota hai.
  if (cloudName && uploadPreset) {
    return uploadToCloudinary(file, cloudName, uploadPreset);
  }

  // Cloudinary variables missing hon to logo/photo compress karke directly
  // database me save hone wali data URL return hoti hai. Isliye Upload button
  // ab missing-variable error nahi dega.
  return compressToDataUrl(file);
}
