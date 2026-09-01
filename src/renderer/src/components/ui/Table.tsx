import React from 'react';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export function Table({ children, className = '', ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto border border-border rounded-lg bg-surface">
      <table className={`w-full text-left text-sm border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-surface-2 border-b border-border text-xs text-text-2 font-medium select-none ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = '', ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-border ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  isSelected?: boolean;
}

export function TableRow({ children, isSelected, className = '', style, ...props }: TableRowProps) {
  return (
    <tr
      style={{ height: 'var(--row-height)', ...style }}
      className={`transition-colors duration-fast hover:bg-surface-2 ${
        isSelected ? 'bg-accent-soft font-medium' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
}

export function TableHead({ children, align = 'left', className = '', style, ...props }: TableHeadProps) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <th
      style={{
        paddingTop: 'var(--cell-padding-y)',
        paddingBottom: 'var(--cell-padding-y)',
        paddingLeft: 'var(--cell-padding-x)',
        paddingRight: 'var(--cell-padding-x)',
        ...style
      }}
      className={`font-medium ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
  isNumeric?: boolean;
}

export function TableCell({ children, align, isNumeric, className = '', style, ...props }: TableCellProps) {
  const effectiveAlign = align || (isNumeric ? 'right' : 'left');
  const alignClass = effectiveAlign === 'right' ? 'text-right' : effectiveAlign === 'center' ? 'text-center' : 'text-left';

  return (
    <td
      style={{
        paddingTop: 'var(--cell-padding-y)',
        paddingBottom: 'var(--cell-padding-y)',
        paddingLeft: 'var(--cell-padding-x)',
        paddingRight: 'var(--cell-padding-x)',
        ...style
      }}
      className={`text-text-1 ${alignClass} ${isNumeric ? 'tabular-nums font-mono text-xs' : ''} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}
