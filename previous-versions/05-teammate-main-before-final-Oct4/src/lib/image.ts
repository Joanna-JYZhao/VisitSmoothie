"use client";

/**
 * Shrinks a photo before it is sent for reading: long side at most 1600 px, JPEG.
 * A phone photo of several megabytes becomes a few hundred kilobytes and is still easy to read.
 */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<string> {
  const source = await load(file);
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source.image, 0, 0, w, h);
  source.release();
  return canvas.toDataURL("image/jpeg", quality);
}

interface Loaded {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function load(file: Blob): Promise<Loaded> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the camera's rotation, so a portrait photo stays upright
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* fall through to the <img> route */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("无法读取图片"));
      el.src = url;
    });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
