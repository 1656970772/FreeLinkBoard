import { useEffect } from "react";
import { useDocumentStore } from "../stores/documentStore";

export function HomePage() {
  const recentFiles = useDocumentStore((state) => state.recentFiles);
  const fileError = useDocumentStore((state) => state.fileError);
  const createNewBoard = useDocumentStore((state) => state.createNewBoard);
  const openBoardDialog = useDocumentStore((state) => state.openBoardDialog);
  const loadRecentFiles = useDocumentStore((state) => state.loadRecentFiles);
  const loadBoard = useDocumentStore((state) => state.loadBoard);
  const removeRecentFile = useDocumentStore((state) => state.removeRecentFile);

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

      {fileError ? (
        <p className="file-alert" role="alert">
          {fileError}
        </p>
      ) : null}

      <section className="recent-list" aria-label="Recent files">
        {recentFiles.length === 0 ? (
          <p className="empty-text">No recent whiteboards yet.</p>
        ) : (
          recentFiles.map((file) => (
            <article key={file.path} className="recent-file">
              <button
                className="recent-file-open"
                type="button"
                aria-label={`Open ${file.title}`}
                onClick={() => void loadBoard(file.path)}
              >
                <strong title={file.title}>{file.title}</strong>
                <span title={file.path}>{file.path}</span>
              </button>
              <button
                className="recent-file-remove"
                type="button"
                aria-label={`Remove ${file.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void removeRecentFile(file.path);
                }}
              >
                Remove
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
