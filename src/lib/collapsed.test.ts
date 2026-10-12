import { describe, expect, it } from 'vitest';
import { parseCollapsed, withCollapsed } from './collapsed';

describe('folded cards', () => {
  it('starts with nothing folded when nothing (or rubbish) is stored', () => {
    expect(parseCollapsed(undefined)).toEqual([]);
    expect(parseCollapsed({ wrap: true })).toEqual([]);
    expect(parseCollapsed(['wrap', 3, null, 'liveblog'])).toEqual(['wrap', 'liveblog']);
  });
  it('remembers a folded card until it is opened again', () => {
    const folded = withCollapsed([], 'wrap', true);
    expect(folded).toEqual(['wrap']);
    expect(withCollapsed(folded, 'wrap', true)).toEqual(['wrap']);
    expect(withCollapsed(folded, 'marketopen', true)).toEqual(['wrap', 'marketopen']);
    expect(withCollapsed(folded, 'wrap', false)).toEqual([]);
  });
});
