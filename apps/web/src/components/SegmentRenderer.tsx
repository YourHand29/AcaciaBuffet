import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CoursePageDto, LayoutSegmentDto } from "@acacia/shared";
import { Upcoming } from "./segments/Upcoming";
import { Announcements } from "./segments/Announcements";
import { Modules } from "./segments/Modules";
import { Files } from "./segments/Files";
import { Grades } from "./segments/Grades";
import { SyllabusCard } from "./segments/SyllabusCard";
import { Placeholder } from "./segments/Placeholder";

const TITLES: Record<LayoutSegmentDto["type"], string> = {
  upcoming: "Upcoming",
  announcements: "Announcements",
  modules: "Modules",
  files: "Files",
  pages: "Pages",
  discussions: "Discussions",
  grades: "Grades",
  syllabus_card: "Syllabus",
  tasks: "Tasks",
};

export function Segment({
  type,
  courseId,
  children,
}: {
  type: LayoutSegmentDto["type"];
  courseId: number;
  children: ReactNode;
}) {
  return (
    <section className="segment" data-segment={type}>
      <div className="segment-header">
        <h2>{TITLES[type] ?? type}</h2>
        <span className="spacer" />
        <Link to={`/courses/${courseId}/config`} className="small">
          Configure
        </Link>
      </div>
      <div className="segment-body">{children}</div>
    </section>
  );
}

export function SegmentRenderer({ segment, page }: { segment: LayoutSegmentDto; page: CoursePageDto }) {
  const { type, options } = segment;
  const courseId = page.course.id;
  let body: ReactNode;
  switch (type) {
    case "upcoming":
      body = <Upcoming items={page.upcoming} options={options} />;
      break;
    case "announcements":
      body = <Announcements announcements={page.announcements} options={options} />;
      break;
    case "modules":
      body = <Modules modules={page.modules} options={options} />;
      break;
    case "files":
      body = <Files files={page.files} courseId={courseId} options={options} />;
      break;
    case "grades":
      body = <Grades grades={page.grades} options={options} />;
      break;
    case "syllabus_card":
      body = <SyllabusCard info={page.info} options={options} />;
      break;
    case "pages":
    case "discussions":
    case "tasks":
      body = <Placeholder type={type} />;
      break;
    default:
      body = <Placeholder type={String(type)} />;
  }
  return (
    <Segment type={type} courseId={courseId}>
      {body}
    </Segment>
  );
}
