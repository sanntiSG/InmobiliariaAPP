import { type SelectHTMLAttributes, forwardRef, useId } from "react";
import { Select } from "./Select";

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, error, id, children, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
        <Select ref={ref} id={inputId} aria-invalid={!!error} {...props}>
          {children}
        </Select>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }
);
SelectField.displayName = "SelectField";
