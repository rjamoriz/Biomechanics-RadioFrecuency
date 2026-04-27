'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { ArticulationRisk, InjuryRiskLevel } from '@/types/injury-risk';
import { JOINT_LABELS, RISK_LEVEL_FILL } from '@/types/injury-risk';

interface ArticulationRiskChartProps {
  articulationRisks: ArticulationRisk[];
  overallRiskLevel: InjuryRiskLevel;
  className?: string;
}

interface RadarDataPoint {
  subject: string;
  risk: number;
  fullMark: number;
}

/**
 * Radar chart showing per-articulation injury risk.
 * Axes: knee (L/R), hip (L/R), ankle (L/R), lumbar.
 * Color adapts to the overall risk level.
 */
export function ArticulationRiskChart({
  articulationRisks,
  overallRiskLevel,
  className,
}: ArticulationRiskChartProps) {
  const data: RadarDataPoint[] = articulationRisks.map((a) => ({
    subject: JOINT_LABELS[a.joint],
    risk: Math.round(a.riskScore * 100),
    fullMark: 100,
  }));

  const strokeColor = RISK_LEVEL_FILL[overallRiskLevel];
  const fillColor = strokeColor;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
          />
          <Radar
            name="Risk"
            dataKey="risk"
            stroke={strokeColor}
            fill={fillColor}
            fillOpacity={0.25}
            dot={{ r: 3, fill: strokeColor }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0', fontWeight: 600 }}
            itemStyle={{ color: '#94a3b8' }}
            formatter={(value: number) => [`${value}%`, 'Risk Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
