// Center recommendations, not SCA certification/assessment requirements.
export const learningLevels = [
  { id: "foundation", name: "파운데이션", english: "Foundation", sessions: 3, description: "처음부터 차근차근, 기본기를 익히는 과정" },
  { id: "intermediate", name: "인터미디엇", english: "Intermediate", sessions: 6, description: "원리를 이해하고 결과를 조절하는 과정" },
  { id: "professional", name: "프로페셔널", english: "Professional", sessions: 10, description: "분석과 문제 해결로 전문성을 완성하는 과정" },
] as const;
export const learningCourses = [
  { id: "barista", name: "바리스타", english: "Barista Skills", station: "ESPRESSO", description: "에스프레소 추출부터 우유 스티밍, 라테 아트와 바 운영까지 배웁니다.", example: "같은 원두로도 맛이 달라지는 이유를 알고, 원하는 맛을 직접 맞춰봅니다.", advanced: true },
  { id: "brewing", name: "브루잉", english: "Brewing", station: "BREWING", description: "분쇄도·물·추출 시간을 조절하며 나만의 추출 레시피를 만듭니다.", example: "드립 커피가 너무 쓰거나 연할 때 무엇부터 바꿔야 할지 실습합니다.", advanced: true },
  { id: "roasting", name: "로스팅", english: "Roasting", station: "ROASTING", description: "생두가 원두가 되는 변화와 열 조절, 로스팅 품질 관리를 배웁니다.", example: "같은 생두를 다르게 볶고 맛을 비교하며 로스팅의 변화를 이해합니다.", advanced: true },
  { id: "sensory", name: "센서리", english: "Sensory Skills", station: "BREWING", description: "향과 맛을 구별하고 커핑을 통해 커피의 특징을 표현합니다.", example: "‘맛있다’에서 한 걸음 더, 과일의 산미와 단맛을 말로 설명해 봅니다.", advanced: true },
  { id: "green", name: "그린커피", english: "Green Coffee", station: "BREWING", description: "산지·품종·가공부터 생두 평가와 유통까지 커피의 출발점을 배웁니다.", example: "생두의 결점과 가공 방식을 살펴보고 구매할 때의 판단 기준을 익힙니다.", advanced: true },
  { id: "water", name: "물과 예방정비", english: "Water & Preventive Maintenance", station: "ESPRESSO", description: "커피에 맞는 물과 필터, 장비를 오래 안전하게 쓰는 관리법을 배웁니다.", example: "정수기 안의 교체용 필터가 하는 일과 교체 시기를 직접 확인합니다.", advanced: false },
  { id: "sustainability", name: "지속가능성", english: "Coffee Sustainability", station: "BREWING", description: "생산자·환경·매장 운영을 연결해 지속가능한 선택을 연습합니다.", example: "매장에서 버리는 우유와 커피를 줄이는 작은 실험부터 시작합니다.", advanced: false },
  { id: "q-grader", name: "Q Grader", english: "Q Grader", station: "BREWING", description: "커피 품질 평가 역량을 키우는 전문 교육입니다. 6명 모집 시 개강을 협의합니다.", example: "현재 경험과 준비 수준을 상담한 뒤 교육 일정과 비용을 안내합니다.", advanced: false },
] as const;
export const learningPackages = [
  { id: "cafe-diploma", name: "카페 디플로마", description: "추출·음료·품질 관리 등 카페 운영에 필요한 자격 경로를 설계합니다." },
  { id: "roastery-diploma", name: "로스터리 디플로마", description: "로스팅 생산과 품질 관리를 중심으로 필요한 교육을 조합합니다." },
  { id: "trade-diploma", name: "트레이드 디플로마", description: "생두 평가와 거래에 필요한 교육을 연결합니다." },
  { id: "all-foundation", name: "올 파운데이션", description: "SCA 5개 모듈의 기초를 함께 배우는 레벨 통합 교육입니다." },
  { id: "all-intermediate", name: "올 인터미디엇", description: "SCA 5개 모듈을 중급 수준으로 연결해 배웁니다." },
  { id: "all-professional", name: "올 프로페셔널", description: "센터 등록 기준: 5개 모듈의 인터미디엇 자격 확인 후 상담합니다." },
  { id: "corporate", name: "기업교육", description: "팀의 목표, 인원과 환경에 맞춰 프로그램을 설계합니다." },
] as const;
export const courseOptions = learningCourses.flatMap(course => course.id === "q-grader"
  ? [{ id: "q-grader:course", name: "Q Grader" }]
  : learningLevels.filter(level => course.advanced || level.id === "foundation").map(level => ({ id: `${course.id}:${level.id}`, name: `${course.name} · ${level.name}` })));
export const interestOptions = [...courseOptions, ...learningPackages.map(item => ({ id: item.id, name: item.name })), { id: "consult", name: "상담 후 결정" }];
export const ageRanges = ["20세 미만", "20대", "30대", "40대", "50대", "60대 이상", "응답하지 않음"];
export const discoveryChannels = ["SNS", "월간커피·잡지", "검색", "지인 추천", "기존 수강", "기업·기관", "기타"];
export const contactChannels = ["전화", "문자", "카카오톡"];
export function getLearningCourse(key: unknown) {
  const option = courseOptions.find(item => item.id === key);
  if (!option) throw new Error("과정과 레벨을 선택해 주세요.");
  const [courseId, levelId] = option.id.split(":");
  const course = learningCourses.find(item => item.id === courseId)!;
  return { ...option, station: course.station, sessions: learningLevels.find(item => item.id === levelId)?.sessions ?? 0 };
}
