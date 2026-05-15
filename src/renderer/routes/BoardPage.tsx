import { useDocumentStore } from "../stores/documentStore";

export function BoardPage() {
  const board = useDocumentStore((state) => state.currentBoard);
  const currentPath = useDocumentStore((state) => state.currentPath);
  const saveStatus = useDocumentStore((state) => state.saveStatus);

  if (!board) return null;

  return (
    <main className="board-page">
      <header className="board-topbar">
        <div>
          <strong title={board.title}>{board.title}</strong>
          <span title={currentPath ?? "Unsaved board"}>{currentPath ?? "Unsaved board"}</span>
        </div>
        <span className="save-status">{saveStatus}</span>
      </header>
      <section className="board-stage">
        <p>Board canvas foundation is ready.</p>
      </section>
    </main>
  );
}
