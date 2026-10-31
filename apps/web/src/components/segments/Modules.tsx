import { useState } from "react";
import type { ModuleDto, ModuleItemDto } from "@acacia/shared";
import { formatDate } from "../../time";

function ModuleItemRow({ item }: { item: ModuleItemDto }) {
  const href = item.htmlUrl ?? item.externalUrl;
  return (
    <li className="module-item">
      <span className="type">{item.type.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {item.title}
        </a>
      ) : (
        <span>{item.title}</span>
      )}
      {item.isNew && <span className="badge new">new</span>}
    </li>
  );
}

function Module({ module, defaultOpen }: { module: ModuleDto; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`module ${module.isCurrent ? "current" : ""}`}>
      <div className="module-head" onClick={() => setOpen((o) => !o)}>
        <span className="chevron">{open ? "▾" : "▸"}</span>
        <span className="truncate">{module.name}</span>
        {module.isCurrent && <span className="badge unread">current</span>}
        {module.items.some((i) => i.isNew) && <span className="badge new">new</span>}
        <span className="spacer" />
        <span className="muted small">
          {module.items.length} items
          {module.unlockAt && ` · unlocks ${formatDate(module.unlockAt)}`}
        </span>
      </div>
      {open && (
        <ul className="module-items">
          {module.items.length === 0 && <li className="muted small">No items</li>}
          {module.items.map((item) => (
            <ModuleItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function Modules({ modules, options }: { modules: ModuleDto[]; options: Record<string, unknown> }) {
  const currentWeek = options.view === "current-week";
  const [showAll, setShowAll] = useState(false);
  const sorted = [...modules].sort((a, b) => a.position - b.position);
  const hasCurrent = sorted.some((m) => m.isCurrent);
  const visible = currentWeek && !showAll && hasCurrent ? sorted.filter((m) => m.isCurrent) : sorted;

  if (sorted.length === 0) return <div className="empty">No modules</div>;
  return (
    <div>
      {visible.map((m) => (
        <Module key={m.id} module={m} defaultOpen={m.isCurrent || (!hasCurrent && visible.length === 1)} />
      ))}
      {currentWeek && hasCurrent && (
        <button className="link small" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show current only" : `Show all ${sorted.length} modules`}
        </button>
      )}
    </div>
  );
}
