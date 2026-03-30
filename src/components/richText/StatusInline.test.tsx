import { describe, expect, it } from 'vitest';
import { STATUS_COLORS, createStatusInlineSpec, generateStatusInlineContent } from './StatusInline';

describe('StatusInline', () => {
  it('exports STATUS_COLORS with expected keys', () => {
    const keys = STATUS_COLORS.map((c) => c.key);
    expect(keys).toContain('blue');
    expect(keys).toContain('green');
    expect(keys).toContain('red');
    expect(keys).toContain('grey');
    expect(keys.length).toBeGreaterThanOrEqual(5);
  });

  it('createStatusInlineSpec returns an inline content spec', () => {
    const spec = createStatusInlineSpec();
    expect(spec).toBeDefined();
    expect(spec.config).toBeDefined();
    expect(spec.config.type).toBe('status');
    expect(spec.implementation.render).toBeDefined();
  });

  it('propSchema has id, text and color with correct defaults', () => {
    const spec = createStatusInlineSpec();
    const { propSchema } = spec.config;
    expect(propSchema.text.default).toBe('Status');
    expect(propSchema.color.default).toBe('blue');
    expect(propSchema.color.values).toContain('blue');
    expect(propSchema.color.values).toContain('green');
  });

  it('generateStatusInlineContent creates content with id', () => {
    const content = generateStatusInlineContent('Done', 'green');
    expect(content.type).toBe('status');
    expect(content.props.text).toBe('Done');
    expect(content.props.color).toBe('green');
    expect(content.props.id).toBeDefined();
    expect(String(content.props.id).startsWith('status-')).toBe(true);
  });
});
