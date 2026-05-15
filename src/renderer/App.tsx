import { BoardPage } from "./routes/BoardPage";
import { HomePage } from "./routes/HomePage";
import { useDocumentStore } from "./stores/documentStore";

export function App() {
  const currentBoard = useDocumentStore((state) => state.currentBoard);

  return currentBoard ? <BoardPage /> : <HomePage />;
}
