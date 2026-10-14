import { Languages } from "lucide-react";

import { cn } from "@/lib/utils";
import { currentLocale, setLocale, type Locale } from "./runtime";

const OPTIONS: Array<{ value: Locale; label: string }> = [
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
];

export function LanguageSwitch({ className, compact = false }: { className?: string; compact?: boolean }) {
    return (
        <div className={cn("flex items-center", compact ? "gap-1.5" : "h-10 px-2", className)}>
            <Languages className="size-3.5 text-foreground/45" />
            {compact ? null : <span className="ml-2 flex-1 text-xs text-foreground/65">{currentLocale === "en" ? "Language" : "语言"}</span>}
            <div className="flex rounded-md bg-foreground/[.06] p-0.5" role="radiogroup" aria-label={currentLocale === "en" ? "Language" : "语言"}>
                {OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={currentLocale === option.value}
                        className={cn(
                            "h-6 rounded px-2 text-[var(--fs-micro)] transition-colors",
                            currentLocale === option.value ? "bg-surface text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground",
                        )}
                        onClick={() => {
                            if (currentLocale !== option.value) setLocale(option.value);
                        }}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
