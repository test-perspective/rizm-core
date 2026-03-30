import type { ProjectManifest } from '../types';

export const predefinedTransformations: Record<string, () => ProjectManifest> = {
  crm: () => ({
    name: 'Customer Relationship Manager',
    entities: [
      {
        id: 'contact',
        name: 'Contact',
        namePlural: 'Contacts',
        properties: [
          { name: 'name', type: 'text', visible: true },
          { name: 'email', type: 'text', visible: true },
          { name: 'company', type: 'text', visible: true },
          { name: 'stage', type: 'select', options: ['Lead', 'Qualified', 'Proposal', 'Closed'], visible: true },
          { name: 'value', type: 'number', visible: true },
          { name: 'lastContact', type: 'date', visible: true },
        ],
        defaultView: 'table',
        titleLikeProperty: 'name',
      },
    ],
    views: [
      {
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'contact',
        visibleProperties: ['name', 'email', 'company', 'stage', 'value'],
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      {
        id: 'pipeline',
        name: 'Sales Pipeline',
        type: 'board',
        entityId: 'contact',
        groupBy: 'stage',
        visibleProperties: ['name', 'company', 'value'],
      },
    ],
    defaultView: 'table',
  }),
  inventory: () => ({
    name: 'Inventory Management',
    entities: [
      {
        id: 'item',
        name: 'Item',
        namePlural: 'Items',
        properties: [
          { name: 'name', type: 'text', visible: true },
          { name: 'sku', type: 'text', visible: true },
          { name: 'category', type: 'select', options: ['Electronics', 'Furniture', 'Supplies', 'Other'], visible: true },
          { name: 'quantity', type: 'number', visible: true },
          { name: 'status', type: 'select', options: ['In Stock', 'Low Stock', 'Out of Stock'], visible: true },
          { name: 'price', type: 'number', visible: true },
        ],
        defaultView: 'table',
        titleLikeProperty: 'name',
      },
    ],
    views: [
      {
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'item',
        visibleProperties: ['name', 'sku', 'category', 'quantity', 'status', 'price'],
        sortBy: 'name',
        sortOrder: 'asc',
      },
      {
        id: 'board',
        name: 'By Status',
        type: 'board',
        entityId: 'item',
        groupBy: 'status',
        visibleProperties: ['name', 'sku', 'quantity', 'price'],
      },
    ],
    defaultView: 'table',
  }),
  book: () => ({
    name: 'Book Tracker',
    entities: [
      {
        id: 'book',
        name: 'Book',
        namePlural: 'Books',
        properties: [
          { name: 'title', type: 'text', visible: true },
          { name: 'author', type: 'text', visible: true },
          { name: 'isbn', type: 'text', visible: true },
          { name: 'status', type: 'select', options: ['Want to Read', 'Reading', 'Finished'], visible: true },
          { name: 'rating', type: 'select', options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'], visible: true },
          { name: 'pages', type: 'number', visible: true },
        ],
        defaultView: 'table',
        titleLikeProperty: 'title',
      },
    ],
    views: [
      {
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'book',
        visibleProperties: ['title', 'author', 'status', 'rating'],
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      {
        id: 'board',
        name: 'Reading Board',
        type: 'board',
        entityId: 'book',
        groupBy: 'status',
        visibleProperties: ['title', 'author', 'rating'],
      },
    ],
    defaultView: 'table',
  }),
  bug: () => ({
    name: 'Bug Tracker',
    entities: [
      {
        id: 'bug',
        name: 'Bug',
        namePlural: 'Bugs',
        properties: [
          { name: 'title', type: 'text', visible: true },
          { name: 'status', type: 'select', options: ['Open', 'In Progress', 'Testing', 'Closed'], visible: true },
          { name: 'severity', type: 'select', options: ['Critical', 'High', 'Medium', 'Low'], visible: true },
          { name: 'assignee', type: 'text', visible: true },
          { name: 'description', type: 'text', visible: false },
        ],
        defaultView: 'kanban',
        titleLikeProperty: 'title',
      },
    ],
    views: [
      {
        id: 'table',
        name: 'Table',
        type: 'table',
        entityId: 'bug',
        visibleProperties: ['title', 'status', 'severity', 'assignee'],
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
      {
        id: 'kanban',
        name: 'Kanban Board',
        type: 'board',
        entityId: 'bug',
        groupBy: 'status',
        visibleProperties: ['title', 'severity', 'assignee'],
      },
    ],
    defaultView: 'kanban',
  }),
};

export function getManifestForTransformationInput(input: string): ProjectManifest | null {
  const lower = input.toLowerCase();

  if (lower.includes('crm') || lower.includes('customer') || lower.includes('contact')) {
    return predefinedTransformations.crm();
  }
  if (lower.includes('inventory') || lower.includes('stock')) {
    return predefinedTransformations.inventory();
  }
  if (lower.includes('book') || lower.includes('reading')) {
    return predefinedTransformations.book();
  }
  if (lower.includes('bug') || lower.includes('issue')) {
    return predefinedTransformations.bug();
  }
  return null;
}
