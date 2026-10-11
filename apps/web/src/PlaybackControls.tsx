import type { Dispatch, SetStateAction } from "react";
type Props = {
  length: number;
  index: number;
  playing: boolean;
  speed: number;
  onIndexChange: (index: number) => void;
  onPlayingChange: Dispatch<SetStateAction<boolean>>;
  onSpeedChange: (speed: number) => void;
};
export default function PlaybackControls({
  length,
  index,
  playing,
  speed,
  onIndexChange,
  onPlayingChange,
  onSpeedChange,
}: Props) {
  function replay() {
    onIndexChange(0);
    onPlayingChange(length > 1);
  }
  return (
    <div className="playback-controls">
      <button
        type="button"
        className="play-button"
        disabled={length < 2}
        onClick={() => {
          if (!playing && index >= length - 1) replay();
          else onPlayingChange(!playing);
        }}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        className="secondary-button"
        disabled={length < 2}
        onClick={replay}
      >
        Replay
      </button>
      <select
        className="speed-select"
        value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value))}
        aria-label="Playback speed"
      >
        {[0.5, 1, 2, 5].map((value) => (
          <option key={value} value={value}>
            {value}x
          </option>
        ))}
      </select>
    </div>
  );
}
