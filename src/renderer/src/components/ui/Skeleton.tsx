import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  variant = 'rectangular',
  width,
  height,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const variantStyles = {
    text: 'rounded-sm h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-md'
  }[variant];

  return (
    <div
      style={{ width, height, ...style }}
      className={`animate-pulse bg-surface-3 ${variantStyles} ${className}`}
      {...props}
    />
  );
}
