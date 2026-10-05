import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

interface FieldProps { label: ReactNode; children: ReactNode; className?: string; error?: string; }
export function Field({ label, children, className = '', error }: FieldProps) {
  return <div className={`ui-field ${className}`}><label>{label}</label>{children}{error && <p role="alert" className="ui-field-error">{error}</p>}</div>;
}
const baseInput = 'ui-input';
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref) {
  return <input ref={ref} className={baseInput} {...props} />;
});
export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) { return <input type="number" className={baseInput} {...props} />; }
export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${baseInput} ui-select`} {...props}>{children}</select>;
}
