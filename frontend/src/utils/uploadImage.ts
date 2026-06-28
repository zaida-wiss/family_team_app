// px att begära från Cloudinary per displaystorlek (minst 2× retina-marginal)
const CLOUDINARY_PX: Record<string, number> = { large: 200, xs: 80, small: 60, hero: 300 };

export function cloudinaryUrl(url: string, size: string): string {
  if (!url.includes("res.cloudinary.com")) return url;
  const px = CLOUDINARY_PX[size] ?? 200;
  const transform = `w_${px},h_${px},c_fill,q_auto,f_auto`;
  return url.replace(/\/upload\/(?:[^/]+\/)?/, `/upload/${transform}/`);
}

async function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Komprimering misslyckades")),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("Kunde inte läsa bilden"));
    img.src = url;
  });
}

export async function uploadImage(file: File, folder = "uploads"): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

  const compressed = await compressImage(file);

  const form = new FormData();
  form.append("file", compressed, "image.jpg");
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
