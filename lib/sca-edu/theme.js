// 16:9 캔버스(인치). PPTX(LAYOUT_WIDE)와 웹 렌더러가 같은 좌표를 공유한다.
export const W = 13.333;
export const H = 7.5;
export const M = 0.95; // 좌우 여백 (키노트 스타일: 넉넉하게)

// 색상은 이 파일 한 곳에서만 관리한다. 사이트(globals.css)도 흰색·블랙·그레이 계열이다.
// 톤앤매너 (2026-09-16 확정): 모든 슬라이드 흰 배경, 글자는 블랙 · 다크그레이 · 그레이만 사용.
// 강조색(초록·빨강 등) 없이 명도 차이와 얇은 선으로만 구분한다.
export const THEME = {
  pptxFont: 'Pretendard',
  webFont: '"Pretendard Variable","Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif',
  c: {
    // 표지·섹션·정리 슬라이드도 흰 배경 (이전 다크 배경용 토큰 이름은 레이아웃 호환을 위해 유지)
    dark: 'FFFFFF',
    darkLine: 'E3E3E3',
    onDark: '111111',      // 블랙
    onDarkMuted: '6B6B6B', // 그레이
    onDarkFaint: 'B5B5B5',
    paper: 'FFFFFF',
    ink: '111111',         // 제목: 블랙
    body: '3F3F3F',        // 본문: 다크그레이
    muted: '6B6B6B',       // 보조: 그레이
    faint: 'BDBDBD',       // 큰 숫자·페이지 번호: 옅은 그레이
    line: 'E3E3E3',        // 구분선
    accentLine: '111111',  // 표지·섹션의 짧은 굵은 선
    good: '262626',        // 비교 태그도 무채색 (다크그레이)
    bad: '8E8E8E',         // 비교 태그도 무채색 (그레이)
  },
};
