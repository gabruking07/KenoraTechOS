import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pager({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  if (pages <= 1) return <div className="projects-toolbar"><span className="table-count">{total} total</span></div>;
  return <div className="projects-toolbar"><span className="table-count">Page {page} of {pages} · {total} total</span><div><button className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16}/></button><button className="icon-button" aria-label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={16}/></button></div></div>;
}
