import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECTION_CONFIG } from '../ai/projection';
import { MiraTask, PROJECTION_RANGE, type GimmickDef } from './gimmick';

const LANTERN: GimmickDef = { id: 'lantern', kind: 'light', name: '灯り', direction: [0, 1, 0] };

describe('PROJECTION_RANGE', () => {
  it('ミラの投影範囲より少し短く、映し直される前に作業が止まる', () => {
    expect(PROJECTION_RANGE).toBeGreaterThan(0);
    expect(PROJECTION_RANGE).toBeLessThan(DEFAULT_PROJECTION_CONFIG.range);
  });
});

describe('MiraTask', () => {
  it('着くまでは進まず、着いたら作業を始め、時間がたてば終わる', () => {
    const task = new MiraTask(LANTERN, 1, 5);
    expect(task.phase).toBe('approach');
    expect(task.update(0.5, false, 1)).toBeNull();
    expect(task.progress).toBe(0);
    expect(task.update(0.1, true, 1)).toBe('started');
    expect(task.phase).toBe('work');
    expect(task.update(0.5, true, 1)).toBeNull();
    expect(task.progress).toBeCloseTo(0.5);
    expect(task.update(0.6, true, 1)).toBe('done');
    expect(task.progress).toBe(1);
    expect(task.active).toBe(false);
    expect(task.update(1, true, 1)).toBeNull(); // 終えたあとは何も起きない
  });

  it('プレイヤーが投影の届く距離より離れると、作業は止まり、戻っても続かない', () => {
    const task = new MiraTask(LANTERN, 1, 5);
    task.update(0.1, true, 1);
    expect(task.update(0.3, true, 6)).toBe('cancelled');
    expect(task.phase).toBe('cancelled');
    expect(task.active).toBe(false);
    expect(task.update(0.3, true, 1)).toBeNull();
    expect(task.progress).toBe(0);
  });

  it('向かう途中で離れても止まる', () => {
    const task = new MiraTask(LANTERN, 1, 5);
    expect(task.update(0.1, false, 5.5)).toBe('cancelled');
  });
});
