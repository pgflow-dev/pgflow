"use client";

import { Button } from "@/components/ui/button";
import { type ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<typeof Button> & {
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  ...props
}: Props) {
  const { pending } = useFormStatus();

  return (
    <Button 
      type="submit" 
      aria-disabled={pending || props.disabled} 
      disabled={pending || props.disabled}
      {...props}
    >
      {pending ? (
        <>
          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
