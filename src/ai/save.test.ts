import { describe, expect, it } from 'vitest';
import { Journey } from '../core/journey';
import emotionData from '../data/emotion.json';
import { Emotion, parseEmotionRules } from './emotion';
import memoryData from '../data/memory.json';
import { MemoryBook, parseMemoryRules } from './memory';
import { parseSaveData, SAVE_VERSION, type SaveData } from './save';

function sample(): SaveData {
  const journey = new Journey();
  journey.land('origin');
  journey.solve('origin', 'lantern');
  journey.collectFragment('origin', 'lantern');
  const emotion = new Emotion(parseEmotionRules(emotionData));
  emotion.feel('discover');
  const memory = new MemoryBook(parseMemoryRules(memoryData));
  memory.record('leftBehind', 'origin', 1000);
  return {
    version: SAVE_VERSION,
    journey: journey.snapshot(),
    emotion: emotion.snapshot(),
    playLog: { lastPlayedAt: 1000 },
    memory: memory.toJSON(),
    diary: [{ at: 1000, place: 'はじまりの星', text: '初めてのはじまりの星。' }],
    souvenirs: [{ id: 'origin.pebble', slot: 'console', at: 1000 }],
  };
}

describe('parseSaveData', () => {
  it('JSON を通しても同じセーブデータに戻る', () => {
    const save = sample();
    expect(parseSaveData(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('版が違う、または旅が壊れていれば読まない', () => {
    const save = sample();
    expect(parseSaveData(null)).toBeNull();
    expect(parseSaveData({ ...save, version: SAVE_VERSION + 1 })).toBeNull();
    expect(parseSaveData({ ...save, version: undefined })).toBeNull();
    expect(parseSaveData({ ...save, journey: { place: 'ship' } })).toBeNull();
  });

  it('感情や前回の日時だけが壊れていれば、そこだけ null にして旅は続ける', () => {
    const save = sample();
    const parsed = parseSaveData({ ...save, emotion: { joy: 'x' }, playLog: 'yesterday', memory: 'lost', diary: 'torn', souvenirs: 'gone' });
    const empty = { version: 1, entries: [] };
    expect(parsed).toEqual({ ...save, emotion: null, playLog: null, memory: empty, diary: [], souvenirs: [] });
    // 記憶を足す前の保存（memory がない）も読め、記憶は空から
    expect(parseSaveData({ version: SAVE_VERSION, journey: save.journey })).toEqual({
      ...save,
      emotion: null,
      playLog: null,
      memory: empty,
      diary: [],
      souvenirs: [],
    });
  });
});
