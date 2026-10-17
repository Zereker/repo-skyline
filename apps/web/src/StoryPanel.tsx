import type { StoryMilestone } from "./types";
import { useState } from "react";

const milestoneKinds: Record<string, string> = {
  first_commit: "首次提交",
  commit_100: "第 100 次提交",
  commit_1000: "第 1000 次提交",
  first_major_contributor: "核心贡献者",
  largest_change: "最大建设潮",
  largest_refactor: "城市更新",
  largest_module: "街区扩张",
  most_active_month: "最活跃月份",
  ownership_transition: "归属交接",
  release: "版本发布",
};

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
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="story-panel">
      <div className="story-heading">
        <div>
          <p className="panel-label">故事模式</p>
          <h2>这座城市如何建成</h2>
        </div>
        <div className="story-controls">
          <button
            type="button"
            className="chapter-toggle"
            aria-expanded={expanded}
            aria-controls="story-chapters"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "收起章节" : "展开章节"}
          </button>
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
            {playing ? "停止故事" : "播放故事"}
          </button>
        </div>
      </div>

      <div className="story-steps" id="story-chapters" hidden={!expanded}>
        {milestones.map((milestone, index) => (
          <button
            type="button"
            className={
              index === activeIndex ? "story-step active" : "story-step"
            }
            key={milestone.id}
            onClick={() => onSelect(index)}
          >
            <span className="story-step-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="story-step-copy">
              <em>{milestoneKinds[milestone.kind] ?? "城市事件"}</em>
              <strong>{milestone.title}</strong>
              <small>{milestone.description}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
