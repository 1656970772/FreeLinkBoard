import { useEffect } from "react";
import { useDocumentStore } from "../stores/documentStore";

export function HomePage() {
  const recentFiles = useDocumentStore((state) => state.recentFiles);
  const createNewBoard = useDocumentStore((state) => state.createNewBoard);
  const openBoardDialog = useDocumentStore((state) => state.openBoardDialog);
  const loadRecentFiles = useDocumentStore((state) => state.loadRecentFiles);
  const loadBoard = useDocumentStore((state) => state.loadBoard);

  useEffect(() => {
    void loadRecentFiles();
  }, [loadRecentFiles]);

  return (
    <main className="home-page">
      <header className="home-header">
        <p className="eyebrow">FreeLinkBoard</p>
        <h1>Recent whiteboards</h1>
      </header>

      <div className="action-row">
        <button type="button" onClick={createNewBoard}>
          New board
        </button>
        <button type="button" onClick={() => void openBoardDialog()}>
          Open .flb
        </button>
      </div>

      <section className="recent-list" aria-label="Recent files">
        {recentFiles.length === 0 ? (
          <p className="empty-text">No recent whiteboards yet.</p>
        ) : (
          recentFiles.map((file) => (
            <button
              key={file.path}
              className="recent-file"
              type="button"
              onClick={() => void loadBoard(file.path)}
            >
              <strong title={file.title}>{file.title}</strong>
              <span title={file.path}>{file.path}</span>
            </button>
          ))
        )}
      </section>
    </main>
  );
}
