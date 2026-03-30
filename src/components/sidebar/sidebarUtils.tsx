import { BookOpen, LayoutGrid, List, Table } from 'lucide-react';

export const normalizeProjectKey = (raw: string) => raw.trim().toUpperCase();

export const isValidProjectKey = (raw: string) =>
  /^[A-Z0-9]{3,10}$/.test(normalizeProjectKey(raw));

export const getViewIcon = (type: string) => {
  switch (type) {
    case 'list':
      return <List className="w-4 h-4" />;
    case 'board':
      return <LayoutGrid className="w-4 h-4" />;
    case 'table':
      return <Table className="w-4 h-4" />;
    case 'wiki':
      return <BookOpen className="w-4 h-4" />;
    default:
      return <List className="w-4 h-4" />;
  }
};
