import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none';

    const sizeStyles = {
      sm: 'text-xs px-2.5 py-1 gap-1.5 h-[28px]',
      md: 'text-sm px-3.5 py-1.5 gap-2 h-[34px]',
      lg: 'text-base px-4 py-2 gap-2.5 h-[42px]'
    }[size];

    const variantStyles = {
      primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover shadow-sm',
      secondary: 'bg-surface-2 text-text-1 hover:bg-surface-3 active:bg-surface-3 border border-border',
      danger: 'bg-danger text-white hover:opacity-90 active:opacity-100 shadow-sm',
      ghost: 'bg-transparent text-text-2 hover:bg-surface-2 hover:text-text-1 active:bg-surface-3',
      outline: 'bg-transparent text-text-1 border border-border-strong hover:bg-surface-2 active:bg-surface-3'
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
