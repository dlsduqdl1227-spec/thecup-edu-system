import {
  nonNegativeNumber,
  optionalText,
  positiveNumber,
  textValue,
} from "./http";

export type RoastPointInput = {
  seconds: number;
  beanTemp: number;
  gasPressure: number;
};

export type RoastProfileInput = {
  beanName: string;
  origin: string;
  process: string;
  batchWeight: number;
  chargeTemp: number;
  turningPointSeconds: number;
  firstCrackSeconds: number;
  dropTemp: number;
  totalSeconds: number;
  developmentSeconds: number;
  developmentRatio: number;
  gasNotes: string;
  notes: string;
  points: RoastPointInput[];
};

export function parseRoastProfile(payload: Record<string, unknown>): RoastProfileInput {
  const totalSeconds = Math.round(positiveNumber(payload.totalSeconds, "총 로스팅 시간"));
  const turningPointSeconds = Math.round(positiveNumber(payload.turningPointSeconds, "터닝포인트 시간"));
  const firstCrackSeconds = Math.round(positiveNumber(payload.firstCrackSeconds, "1차 크랙 시간"));
  if (!(turningPointSeconds < firstCrackSeconds && firstCrackSeconds < totalSeconds)) {
    throw new Error("터닝포인트, 1차 크랙, 종료 시간의 순서를 확인해 주세요.");
  }

  const rawPoints = Array.isArray(payload.points) ? payload.points : [];
  const points = rawPoints
    .map((point) => {
      const record = (point ?? {}) as Record<string, unknown>;
      return {
        seconds: Math.round(nonNegativeNumber(record.seconds, "프로파일 시간")),
        beanTemp: nonNegativeNumber(record.beanTemp, "원두 온도"),
        gasPressure: nonNegativeNumber(record.gasPressure, "가스 압력"),
      };
    })
    .sort((a, b) => a.seconds - b.seconds);
  if (points.length < 3) throw new Error("그래프 포인트를 3개 이상 입력해 주세요.");
  if (points[0].seconds !== 0 || points.at(-1)?.seconds !== totalSeconds) {
    throw new Error("그래프의 첫 포인트는 0초, 마지막 포인트는 총 로스팅 시간이어야 합니다.");
  }
  if (new Set(points.map((point) => point.seconds)).size !== points.length) {
    throw new Error("그래프 포인트 시간은 중복될 수 없습니다.");
  }
  if (points.some((point) => point.seconds > totalSeconds || point.gasPressure > 5)) {
    throw new Error("그래프 시간 또는 가스 압력(0~5bar) 범위를 확인해 주세요.");
  }
  if (![turningPointSeconds, firstCrackSeconds, totalSeconds].every(
    (seconds) => points.some((point) => point.seconds === seconds),
  )) {
    throw new Error("터닝포인트, 1차 크랙, 종료 시점이 그래프 포인트에 자동 반영되지 않았습니다.");
  }

  const developmentSeconds = totalSeconds - firstCrackSeconds;
  const dropTemp = positiveNumber(points.at(-1)?.beanTemp, "종료 온도");
  return {
    beanName: textValue(payload.beanName, "원두명", 100),
    origin: optionalText(payload.origin, 100),
    process: optionalText(payload.process, 100),
    batchWeight: positiveNumber(payload.batchWeight, "배치 중량"),
    chargeTemp: positiveNumber(payload.chargeTemp, "투입 온도"),
    turningPointSeconds,
    firstCrackSeconds,
    dropTemp,
    totalSeconds,
    developmentSeconds,
    developmentRatio: Number(((developmentSeconds / totalSeconds) * 100).toFixed(1)),
    gasNotes: optionalText(payload.gasNotes, 500),
    notes: optionalText(payload.notes, 1500),
    points,
  };
}

export function calculateRorMetrics(
  points: RoastPointInput[],
  turningPointSeconds: number,
  firstCrackSeconds: number,
  totalSeconds: number,
) {
  return {
    turningToCrack: averageRor(points, turningPointSeconds, firstCrackSeconds),
    development: averageRor(points, firstCrackSeconds, totalSeconds),
  };
}

function averageRor(points: RoastPointInput[], start: number, end: number): number {
  if (points.length < 2 || end <= start) return 0;
  const startTemp = interpolateTemperature(points, start);
  const endTemp = interpolateTemperature(points, end);
  const minutes = (end - start) / 60;
  return Number(((endTemp - startTemp) / minutes).toFixed(1));
}

function interpolateTemperature(points: RoastPointInput[], seconds: number): number {
  const exact = points.find((point) => point.seconds === seconds);
  if (exact) return exact.beanTemp;
  const before = [...points].reverse().find((point) => point.seconds < seconds);
  const after = points.find((point) => point.seconds > seconds);
  if (!before) return points[0].beanTemp;
  if (!after) return points.at(-1)?.beanTemp ?? before.beanTemp;
  const ratio = (seconds - before.seconds) / (after.seconds - before.seconds);
  return before.beanTemp + (after.beanTemp - before.beanTemp) * ratio;
}
