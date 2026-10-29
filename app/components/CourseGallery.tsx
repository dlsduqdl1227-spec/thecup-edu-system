"use client";
import { useEffect, useRef, useState } from "react";
import { learningCourses } from "../../lib/learning-catalog";

const moduleVisuals: Record<string, { image: string; line: string }> = {
  barista: { image: "barista", line: "에스프레소부터 라테 아트까지." },
  brewing: { image: "brewing", line: "내가 만드는, 나만의 레시피." },
  roasting: { image: "roasting", line: "생두의 변화와 로스팅 품질을 배우다." },
  sensory: { image: "cupping", line: "느끼고, 구별하고, 표현하다." },
  green: { image: "green", line: "커피의 시작을 이해하는 시선." },
};

export function EducationPhoto({ image, alt, eager = false, sizes = "(max-width: 640px) 90vw, 600px" }: { image: string; alt: string; eager?: boolean; sizes?: string }) {
  const heights: Record<string, number> = { hero: 854, barista: 1920, brewing: 1952, roasting: 854, green: 854, cupping: 1920 };
  // Static responsive files avoid runtime image transforms and third-party requests.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/education-visuals/${image}-1280.webp`} srcSet={`/education-visuals/${image}-640.webp 640w, /education-visuals/${image}-1280.webp 1280w`} sizes={sizes} width={1280} height={heights[image] ?? 854} alt={alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} decoding="async" />;
}

export function CourseGallery({ activeCourse, onSelect }: { activeCourse: string; onSelect: (id: string) => void }) {
  const gallery = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const node = gallery.current;
    if (!node) return;
    // Include the small focus-outline inset in the snap-edge tolerance.
    const update = () => setEdges({ start: node.scrollLeft <= 8, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 8 });
    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => { node.removeEventListener("scroll", update); observer.disconnect(); };
  }, []);
  function move(direction: number) {
    const node = gallery.current;
    if (!node) return;
    const card = node.querySelector("button");
    const distance = (card?.getBoundingClientRect().width ?? 300) + 20;
    node.scrollBy({ left: direction * distance, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  return <>
    <div ref={gallery} className="learning-course-gallery" id="learning-course-gallery" role="group" aria-label="교육 모듈 선택">
      {learningCourses.filter(course => course.advanced).map(course => {
        const visual = moduleVisuals[course.id];
        return <button type="button" className="learning-course-card" key={course.id} aria-label={course.name} aria-pressed={activeCourse === course.id} aria-controls="learning-course-detail" onClick={() => onSelect(course.id)}>
          <span className="learning-course-card-copy"><span>{course.english}</span><strong>{course.name}</strong><span>{visual.line}</span></span>
          <EducationPhoto image={visual.image} alt="" sizes="(max-width: 640px) 80vw, 340px" />
          <span className="learning-course-card-action" aria-hidden="true">{activeCourse === course.id ? "✓" : "+"}</span>
        </button>;
      })}
    </div>
    <div className="learning-gallery-toolbar">
      <span>과정을 선택하면 아래에서 자세히 볼 수 있어요.</span>
      <div><button type="button" onClick={() => move(-1)} disabled={edges.start} aria-label="이전 과정 보기" aria-controls="learning-course-gallery">‹</button><button type="button" onClick={() => move(1)} disabled={edges.end} aria-label="다음 과정 보기" aria-controls="learning-course-gallery">›</button></div>
    </div>
  </>;
}
