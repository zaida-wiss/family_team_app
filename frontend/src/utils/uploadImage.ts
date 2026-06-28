// px att begära från Cloudinary per displaystorlek (minst 2× retina-marginal)
const CLOUDINARY_PX: Record<string, number> = { large: 200, xs: 80, small: 60, hero: 240 };

export function cloudinaryUrl(url: string, size: string): string {
  if (!url.includes("res.cloudinary.com")) return url;
  const px = CLOUDINARY_PX[size] ?? 200;
  const transform = `w_${px},h_${px},c_fill,q_auto,f_auto`;
  return url.replace(/\/upload\/(?:[^/]+\/)?/, `/upload/${transform}/`);
}

export async function uploadImage(file: File, folder = "uploads"): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", preset);
  form.append("folder", folder);

  const resp = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form }
  );

  if (!resp.ok) throw new Error("Uppladdning misslyckades");

  const data = await resp.json() as { secure_url: string };
  // Spara rå URL — transforms appliceras vid rendering beroende på displaystorlek
  return data.secure_url;
}
