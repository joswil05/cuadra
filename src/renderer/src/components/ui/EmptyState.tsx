import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center bg-surface border border-border border-dashed rounded-xl ${className}`}>
      {icon && <div className="mb-3 text-text-3">{icon}</div>}
      <h3 className="text-sm font-semibold text-text-1">{title}</h3>
      {description && <p className="mt-1 text-xs text-text-2 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
