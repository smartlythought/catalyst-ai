"use client";

import { useId } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color: string;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width = 72,
  height = 34,
  color,
  strokeWidth = 1.5,
}: SparklineProps) {
  const reactId = useId();
  if (data.length < 2) return null;

  const gradId = `sparkGrad_${reactId}`;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pointsArr = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return { x, y };
  });

  const points = pointsArr.map((p) => `${p.x},${p.y}`).join(" ");

  const firstPt = pointsArr[0];
  const lastPt = pointsArr[pointsArr.length - 1];

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        points={points}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={firstPt.x} cy={firstPt.y} r="2" fill={color} opacity="0.5" />
      <circle cx={lastPt.x} cy={lastPt.y} r="2" fill={color} />
    </svg>
  );
}
