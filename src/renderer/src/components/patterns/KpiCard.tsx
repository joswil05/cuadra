import React from 'react';
import { Badge, BadgeVariant } from '../ui/Badge';

export interface KpiCardProps {
  title: string;
  value: string;
  subValue?: string;
  badgeText?: string;
  badgeVariant?: BadgeVariant;
  icon?: React.ReactNode;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subValue,
  badgeText,
  badgeVariant = 'neutral',
  icon,
  className = ''
}: KpiCardProps) {
  return (
    <div className={`p-4 bg-surface border border-border rounded-lg shadow-xs flex flex-col justify-between gap-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-2">{title}</span>
        {icon && <span className="text-text-3">{icon}</span>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xl font-semibold text-text-1 tabular-nums">{value}</div>
        {badgeText && <Badge variant={badgeVariant}>{badgeText}</Badge>}
      </div>

      {subValue && <div className="text-xs text-text-3">{subValue}</div>}
    </div>
  );
}
