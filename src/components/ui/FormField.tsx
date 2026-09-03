import { type InputHTMLAttributes, forwardRef, useId } from "react";
import { Input } from "./Input";
import { cn } from "@/lib/utils/cn";

export type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, id, className, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {label}
        </label>
        <Input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(error && "border-danger focus:border-danger focus:ring-danger/20", className)}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
);
FormField.displayName = "FormField";
