import { Loader2 } from 'lucide-react';

type ScmBusyOverlayProps = {
  active: boolean;
  message: string;
};

export function ScmBusyOverlay({ active, message }: ScmBusyOverlayProps) {
  if (!active) return null;

  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="flex flex-col items-center gap-3 px-6 py-4 bg-zinc-950/80 border border-zinc-800 rounded-lg shadow-xl max-w-sm text-center">
        <Loader2 className="w-6 h-6 text-white animate-spin" aria-hidden />
        <p className="text-sm text-zinc-100">{message}</p>
      </div>
    </div>
  );
}
