import type { StoryMilestone } from "./types";

type Props = {
  milestones: StoryMilestone[];
  activeIndex: number;
  playing: boolean;
  onSelect: (index: number) => void;
  onPlay: () => void;
  onStop: () => void;
};

export default function StoryPanel({
  milestones,
  activeIndex,
  playing,
  onSelect,
  onPlay,
  onStop,
}: Props) {
  return (
    <section className="story-panel">
      <div className="story-heading">
        <div>
          <p className="panel-label">Story Mode</p>
          <h2>How this city was built</h2>
        </div>
        <div className="story-controls">
          <span className="story-progress">
            {milestones.length
              ? `${String(activeIndex + 1).padStart(2, "0")} / ${String(milestones.length).padStart(2, "0")}`
              : "00 / 00"}
          </span>
          <button
            type="button"
            className={playing ? "secondary-button" : "play-button"}
            disabled={milestones.length === 0}
            onClick={playing ? onStop : onPlay}
          >
            {playing ? "Stop story" : "Play story"}
          </button>
        </div>
      </div>

      <div className="story-steps">
        {milestones.map((milestone, index) => (
          <button
            type="button"
            className={index === activeIndex ? "story-step active" : "story-step"}
            key={milestone.id}
            onClick={() => onSelect(index)}
          >
            <span className="story-step-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="story-step-copy">
              <em>{milestone.kind.replaceAll("_", " ")}</em>
              <strong>{milestone.title}</strong>
              <small>{milestone.description}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
