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
  // Begär 400×400 crop + auto-format direkt från Cloudinary CDN
  return data.secure_url.replace("/upload/", "/upload/w_400,h_400,c_fill,q_auto,f_auto/");
}
