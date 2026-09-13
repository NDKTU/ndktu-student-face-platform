import React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;
export const DropdownMenuPortal = DropdownPrimitive.Portal;
export const DropdownMenuSub = DropdownPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
    React.ElementRef<typeof DropdownPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                'z-50 min-w-[8rem] overflow-hidden rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg shadow-black/5',
                'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
                className
            )}
            {...props}
        />
    </DropdownPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownPrimitive.Content.displayName;

export const DropdownMenuItem = React.forwardRef<
    React.ElementRef<typeof DropdownPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & {
        destructive?: boolean;
    }
>(({ className, destructive, ...props }, ref) => (
    <DropdownPrimitive.Item
        ref={ref}
        className={cn(
            'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm outline-none transition-colors duration-150',
            destructive
                ? 'text-destructive focus:bg-destructive/10 focus:text-destructive'
                : 'text-foreground focus:bg-primary/10 focus:text-primary',
            'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            className
        )}
        {...props}
    />
));
DropdownMenuItem.displayName = DropdownPrimitive.Item.displayName;

export const DropdownMenuSeparator = React.forwardRef<
    React.ElementRef<typeof DropdownPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <DropdownPrimitive.Separator
        ref={ref}
        className={cn('-mx-1 my-1 h-px bg-border/60', className)}
        {...props}
    />
));
DropdownMenuSeparator.displayName = DropdownPrimitive.Separator.displayName;

