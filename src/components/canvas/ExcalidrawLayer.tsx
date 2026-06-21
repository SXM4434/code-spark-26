// Excalidraw freeform sketch layer. Lazy-loaded; client-only.
import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";

export default function ExcalidrawLayer() {
  return (
    <Excalidraw
      theme="dark"
      initialData={{ appState: { viewBackgroundColor: "transparent" } }}
      UIOptions={{
        canvasActions: {
          changeViewBackgroundColor: false,
          saveToActiveFile: false,
          loadScene: false,
          export: false,
          toggleTheme: false,
        },
      }}
    />
  );
}
