import { PageLead, PublicShell } from "./PublicShell";

export function DocumentPage({ currentPath, eyebrow, title, lead, notice, sections }) {
  return (
    <PublicShell currentPath={currentPath}>
      <div className="ml-document-layout ml-container">
        <aside className="ml-document-index" aria-label="فهرست این صفحه">
          <span>در این صفحه</span>
          <nav>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>{section.title}</a>
            ))}
          </nav>
        </aside>
        <article className="ml-document">
          <PageLead eyebrow={eyebrow} title={title} lead={lead} compact />
          {notice && <p className="ml-document-notice">{notice}</p>}
          {sections.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </article>
      </div>
    </PublicShell>
  );
}
