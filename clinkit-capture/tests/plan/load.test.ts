import { describe, it, expect } from 'vitest';
import { loadPlan } from '../../src/plan/load';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const TMP = join(__dirname, '../../.tmp-test');

function writeTmp(name: string, content: unknown): string {
  mkdirSync(TMP, { recursive: true });
  const p = join(TMP, name);
  writeFileSync(p, JSON.stringify(content));
  return p;
}

describe('loadPlan', () => {
  it('loads a valid plan', () => {
    const p = writeTmp('valid.json', {
      name: 'test',
      pbirsBaseUrl: 'http://tpdcpbi02',
      pages: [{ slug: '01', reportPath: '/x', reportType: 'pbix', pageName: 'Overview' }],
    });
    const plan = loadPlan(p);
    expect(plan.name).toBe('test');
    expect(plan.pages).toHaveLength(1);
  });

  it('throws if file does not exist', () => {
    expect(() => loadPlan('/nonexistent/plan.json')).toThrow();
  });

  it('throws if name is missing', () => {
    const p = writeTmp('no-name.json', { pbirsBaseUrl: 'http://x', pages: [] });
    expect(() => loadPlan(p)).toThrow(/name/);
  });

  it('throws if pbirsBaseUrl is missing', () => {
    const p = writeTmp('no-url.json', { name: 'x', pages: [] });
    expect(() => loadPlan(p)).toThrow(/pbirsBaseUrl/);
  });

  it('throws if pages is not an array', () => {
    const p = writeTmp('bad-pages.json', { name: 'x', pbirsBaseUrl: 'http://x', pages: 'oops' });
    expect(() => loadPlan(p)).toThrow(/pages/);
  });

  it('throws if a pbix page has no pageName', () => {
    const p = writeTmp('no-pagename.json', {
      name: 'x', pbirsBaseUrl: 'http://x',
      pages: [{ slug: '01', reportPath: '/x', reportType: 'pbix' }],
    });
    expect(() => loadPlan(p)).toThrow(/pageName/);
  });

  it('throws if a page has no slug', () => {
    const p = writeTmp('no-slug.json', {
      name: 'x', pbirsBaseUrl: 'http://x',
      pages: [{ reportPath: '/x', reportType: 'rdl' }],
    });
    expect(() => loadPlan(p)).toThrow(/slug/);
  });

  it('throws if a page has no reportPath', () => {
    const p = writeTmp('no-path.json', {
      name: 'x', pbirsBaseUrl: 'http://x',
      pages: [{ slug: '01', reportType: 'rdl' }],
    });
    expect(() => loadPlan(p)).toThrow(/reportPath/);
  });

  it('throws if a page has invalid reportType', () => {
    const p = writeTmp('bad-type.json', {
      name: 'x', pbirsBaseUrl: 'http://x',
      pages: [{ slug: '01', reportPath: '/x', reportType: 'invalid' }],
    });
    expect(() => loadPlan(p)).toThrow(/reportType/);
  });
});
