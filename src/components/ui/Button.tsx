import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'blue' | 'ochre' | 'green' | 'violet';
const VARIANTS: Record<ButtonVariant, string> = {
  blue: 'btn-primary', ochre: 'btn-warning', green: 'btn-success', violet: 'btn-violet',
};
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; children?: ReactNode; }
export default function Button({ variant = 'blue', disabled, children, className = '', ...props }: ButtonProps) {
  return <button disabled={disabled} className={`ui-btn ${VARIANTS[variant]} ${className}`} {...props}>{children}</button>;
}
export function LinkButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ui-link-btn ${className}`} {...props}>{children}</button>;
}
export function IconButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ui-icon-btn ${className}`} {...props}>{children}</button>;
}
