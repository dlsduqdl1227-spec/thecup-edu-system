import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("education imagery is local, responsive and lightweight with real photo credits and license", async () => {
  const manifest = JSON.parse(await readFile(new URL("../design/education-visuals.json", import.meta.url), "utf8"));
  assert.equal(manifest.source, "Pexels");
  assert.equal(manifest.license, "https://www.pexels.com/license/");
  assert.equal(manifest.assets.length, 6);
  let total = 0;
  for (const asset of manifest.assets) {
    assert.ok(asset.author.length > 3);
    assert.match(asset.url, /^https:\/\/www\.pexels\.com\/photo\//);
    assert.ok(asset.height > 0);
    assert.equal(asset.files.length, 2);
    for (const file of asset.files) {
      const bytes = await readFile(new URL("../" + file, import.meta.url));
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert.ok(bytes.length < 280_000, `${file} is lightweight`);
      total += bytes.length;
    }
  }
  assert.ok(total < 1_000_000, "All desktop and mobile image variants stay below 1 MB");
  const gallery = await readFile(new URL("../app/components/CourseGallery.tsx", import.meta.url), "utf8");
  assert.match(gallery, /srcSet=/);
  assert.match(gallery, /loading=\{eager \? "eager" : "lazy"\}/);
  assert.match(gallery, /prefers-reduced-motion/);
  assert.match(gallery, /aria-pressed=/);
  assert.match(gallery, /observer.disconnect/);
  const landing = await readFile(new URL("../app/components/CourseLanding.tsx", import.meta.url), "utf8");
  assert.match(landing, /교육 분야를 설명하는 참고 이미지/);
  assert.doesNotMatch(landing, /AI 연출 이미지/);
  assert.doesNotMatch(landing, /디플로마는 교육 신청만으로|learners-how-it-works/);
});
