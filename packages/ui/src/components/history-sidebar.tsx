import { History, Trash2, X, Globe, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { HistoryEntry } from "@/lib/history";

interface HistorySidebarProps {
  open: boolean;
  onClose: () => void;
  entries: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString();
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

export function HistorySidebar({
  open,
  onClose,
  entries,
  onSelect,
  onClear,
}: HistorySidebarProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-background border-r border-border flex flex-col animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">History</span>
          </div>
          <div className="flex items-center gap-1">
            {entries.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClear}
                title="Clear history"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Entries */}
        <ScrollArea className="flex-1">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No history yet
            </div>
          ) : (
            <div className="p-2">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelect(entry)}
                  className="w-full text-left rounded-md px-3 py-2.5 hover:bg-muted transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    {entry.mode === "render" ? (
                      <Globe className="size-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <Search className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm truncate text-foreground">
                      {shortenUrl(entry.url)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-5.5">
                    <span className="text-xs text-muted-foreground">
                      {entry.mode}
                    </span>
                    {entry.engine && (
                      <>
                        <span className="text-xs text-muted-foreground/50">
                          /
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entry.engine}
                        </span>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground/50 ml-auto">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  );
}
