/** Заменяет data:image в HTML на URL после загрузки на сервер. */
export async function externalizeEmbeddedImages(
  html: string,
  uploadFile: (file: File) => Promise<{ url: string }>,
): Promise<string> {
  if (!html || !html.includes("data:image/")) return html;

  const dataUrls = new Set<string>();
  const re = /src=(["'])(data:image\/[^"']+)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    dataUrls.add(m[2]);
  }
  if (dataUrls.size === 0) return html;

  let out = html;
  for (const dataUrl of dataUrls) {
    const url = await dataUrlToUploadUrl(dataUrl, uploadFile);
    out = out.split(dataUrl).join(url);
  }
  return out;
}

async function dataUrlToUploadUrl(
  dataUrl: string,
  uploadFile: (file: File) => Promise<{ url: string }>,
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext =
    blob.type === "image/jpeg"
      ? "jpg"
      : blob.type === "image/webp"
        ? "webp"
        : blob.type === "image/gif"
          ? "gif"
          : "png";
  const file = new File([blob], `embedded.${ext}`, { type: blob.type || "image/png" });
  const { url } = await uploadFile(file);
  return url;
}

export function htmlHasEmbeddedImages(html: string): boolean {
  return /data:image\//i.test(html);
}
