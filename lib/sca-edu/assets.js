// URLs always pass through the same course-and-level authorization as the deck.
export function eduAssetUrl(course, level, asset) {
  if (!/^[a-z0-9-]{1,40}$/.test(course) || !/^[A-Za-z]{1,20}$/.test(level) || !/^[a-z0-9-]{1,60}$/.test(asset)) throw new Error('Invalid education asset');
  return `/api/edu/decks/${course}/${level}/assets/${asset}`;
}

export async function loadPresentationImages(laid, fetcher = fetch) {
  const images = new Map();
  for (const slide of laid) for (const shape of slide.shapes) {
    if (shape.t !== 'image' || images.has(shape.src)) continue;
    const response = await fetcher(shape.src, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png') throw new Error('필수 이미지를 불러오지 못했습니다. 다시 로그인한 뒤 시도해 주세요.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    images.set(shape.src, `data:image/png;base64,${btoa(binary)}`);
  }
  return laid.map(slide => ({ ...slide, shapes: slide.shapes.map(shape => shape.t === 'image' ? { ...shape, data: images.get(shape.src) } : shape) }));
}
