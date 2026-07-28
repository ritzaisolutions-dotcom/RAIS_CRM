export function PageLoadingSkeleton() {
  return (
    <div className="page-loading" aria-busy="true" aria-label="Laden">
      <div className="page-loading-bar lg" />
      <div className="page-loading-bar" style={{ width: "70%" }} />
      <div className="page-loading-bar" style={{ width: "90%" }} />
      <div className="page-loading-bar" style={{ width: "55%" }} />
      <div className="page-loading-bar lg" />
      <div className="page-loading-bar" style={{ width: "80%" }} />
    </div>
  );
}
