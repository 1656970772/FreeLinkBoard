import { useEffect } from "react";
import { BoardPage } from "./routes/BoardPage";
import { HomePage } from "./routes/HomePage";
import { useDocumentStore } from "./stores/documentStore";

export function App() {
  const currentBoard = useDocumentStore((state) => state.currentBoard);
  const saveStatus = useDocumentStore((state) => state.saveStatus);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!currentBoard || saveStatus === "saved") return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentBoard, saveStatus]);

  return currentBoard ? <BoardPage /> : <HomePage />;
}
