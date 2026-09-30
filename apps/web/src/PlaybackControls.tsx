import { useEffect, useState } from "react";

type Props = {
  length: number;
  index: number;
  onIndexChange: (index: number) => void;
};

export default function PlaybackControls({
  length,
  index,
  onIndexChange,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing || length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      if (index + 1 >= length) {
        setPlaying(false);
        return;
      }
      onIndexChange(index + 1);
    }, Math.max(80, 700 / speed));

    return () => window.clearInterval(timer);
  }, [playing, speed, length, index, onIndexChange]);

  function replay() {
    if (length === 0) {
      return;
    }
    onIndexChange(0);
    setPlaying(true);
  }

  return (
    <div className="playback-controls">
      <button
        type="button"
        className="play-button"
        disabled={length === 0}
        onClick={() => {
          if (!playing && index >= Math.max(0, length - 1)) {
            replay();
          } else {
            setPlaying((value) => !value);
          }
        }}
      >
        {playing ? "Pause" : "Play"}
      </button>

      <button
        type="button"
        className="secondary-button"
        disabled={length === 0}
        onClick={replay}
      >
        Replay
      </button>

      <select
        className="speed-select"
        value={speed}
        onChange={(event) => setSpeed(Number(event.target.value))}
        aria-label="Playback speed"
      >
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={5}>5x</option>
      </select>
    </div>
  );
}
