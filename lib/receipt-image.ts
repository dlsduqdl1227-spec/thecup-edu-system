const MAX_SOURCE_BYTES = 20_000_000;
const MAX_RECEIPT_BYTES = 400_000;

export function validateReceiptSource(source: File): void {
  if (!source.size) throw new Error("내용이 없는 파일입니다. 다른 사진을 선택해 주세요.");
  if (source.size > MAX_SOURCE_BYTES) throw new Error("원본 사진은 20MB 이하만 선택할 수 있습니다.");
  const imageType = /^image\/(jpeg|png|webp|heic|heif|avif|gif|bmp)$/i.test(source.type);
  const untypedImage = (!source.type || source.type === "application/octet-stream")
    && /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(source.name);
  if (!imageType && !untypedImage) throw new Error("영수증 사진을 선택해 주세요. PDF나 문서는 첨부할 수 없습니다.");
}

export async function optimizeReceipt(source: File): Promise<File> {
  validateReceiptSource(source);
  const image = await loadReceiptImage(source);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (!image.width || !image.height) throw new Error("사진의 크기를 읽을 수 없습니다. 다른 사진을 선택해 주세요.");
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 최적화할 수 없습니다.");
    let maxSide = 1800;
    let quality = 0.82;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) => {
        canvas!.toBlob(
          (result) => result ? resolve(result) : reject(new Error("사진 변환에 실패했습니다. 다시 선택해 주세요.")),
          "image/jpeg", quality,
        );
      });
      if (blob.size <= 350_000) break;
      maxSide = Math.round(maxSide * 0.82);
      quality = Math.max(0.58, quality - 0.06);
    }
    if (!blob || blob.size > MAX_RECEIPT_BYTES) {
      throw new Error("영수증 이미지를 400KB 이하로 줄일 수 없습니다. 다른 사진을 선택해 주세요.");
    }
    return new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
  } finally {
    image.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

async function loadReceiptImage(source: File): Promise<{
  source: CanvasImageSource; width: number; height: number; close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Safari can decode some camera/album images only through an image element.
    }
  }
  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = "async";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(
        /heic|heif/i.test(source.type + source.name)
          ? "이 기기에서는 HEIC 사진을 읽을 수 없습니다. JPG로 저장하거나 영수증 화면을 캡처해 선택해 주세요."
          : "사진을 읽을 수 없습니다. 앨범에서 원본을 내려받거나 다른 사진을 선택해 주세요.",
      ));
      element.src = objectUrl;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(objectUrl) };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}
