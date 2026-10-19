/**
 * Locks the visualizer to (viewport − header) so nested flex + overflow-auto
 * (metadata card, chart area) scroll inside the shell instead of scrolling `main.app-main-body`.
 */
export default function VisualizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 min-h-0 w-full flex-col overflow-hidden">
      {children}
    </div>
  );
}
