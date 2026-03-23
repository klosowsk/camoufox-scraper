import { useState, type FormEvent } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  initialUrl?: string;
}

export function UrlInput({ onSubmit, isLoading, initialUrl = "" }: UrlInputProps) {
  const [url, setUrl] = useState(initialUrl);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    // Auto-prepend https:// if missing
    const finalUrl =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;

    setUrl(finalUrl);
    onSubmit(finalUrl);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative flex items-center">
        <Search className="absolute left-4 size-5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter a URL to render..."
          className="w-full h-12 pl-12 pr-28 rounded-full border border-input bg-card text-foreground text-base placeholder:text-muted-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/30 dark:bg-input/20 dark:border-border"
          autoFocus
        />
        <Button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="absolute right-1.5 h-9 rounded-full px-5"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Go"
          )}
        </Button>
      </div>
    </form>
  );
}
