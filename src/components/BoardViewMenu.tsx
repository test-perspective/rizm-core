import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

interface BoardViewMenuProps {
  onConfigClick: () => void;
}

export function BoardViewMenu({ onConfigClick }: BoardViewMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleConfigClick = () => {
    onConfigClick();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
        type="button"
        aria-label="Menu"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg z-50">
          <div className="py-1">
            <button
              onClick={handleConfigClick}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-zinc-800 transition-colors"
              type="button"
            >
              Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
