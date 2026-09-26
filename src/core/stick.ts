/** 仮想スティックの値。x は右、y は前（画面の上）が正で、長さは 0〜1。 */
export interface StickValue {
  x: number;
  y: number;
}

/**
 * 指の移動量（画面座標。右と下が正）からスティックの値を求める。
 * radius 以上動かしたら長さ 1 に丸め、deadZone（radius に対する割合）以内は 0 にする。
 */
export function stickFromDrag(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
  out: StickValue = { x: 0, y: 0 },
): StickValue {
  const length = Math.hypot(dx, dy) / radius;
  if (length <= deadZone) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  // 遊びの分を差し引いて、端まで倒したときにちょうど 1 になるよう伸ばす
  const magnitude = Math.min((length - deadZone) / (1 - deadZone), 1);
  const scale = magnitude / length / radius;
  out.x = dx * scale;
  out.y = -dy * scale;
  return out;
}
