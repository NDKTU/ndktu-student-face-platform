import * as React from "react"
import { cn } from "@/utils/utils"

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          if (onCheckedChange) {
              onCheckedChange(e.target.checked);
          }
      };

    return (
      <label className={cn("relative inline-flex items-center cursor-pointer", disabled && "opacity-50 cursor-not-allowed", className)}>
        <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={checked}
            onChange={handleChange}
            disabled={disabled}
            ref={ref}
            {...props}
        />
        <div className="w-11 h-6 bg-[#D8DBEC] peer-focus-visible:outline-none peer-focus-visible:ring-[3px] peer-focus-visible:ring-primary/15 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:shadow-sm after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
      </label>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
