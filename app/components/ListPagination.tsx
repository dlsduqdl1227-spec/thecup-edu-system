export function ListPagination({ total, page, pageSize, onPageChange, onPageSizeChange, label, disabled = false }: {
  total: number; page: number; pageSize: number; onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void; label: string; disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="member-list-pagination" aria-label={label}>
    <label>표시 개수<select aria-label="표시 개수" value={pageSize} disabled={disabled} onChange={e => onPageSizeChange(Number(e.target.value))}>
      {[10, 20, 50].map(size => <option key={size} value={size}>{size}명씩</option>)}
    </select></label>
    <span>{total ? page * pageSize + 1 : 0}–{Math.min(total, (page + 1) * pageSize)} / {total}명</span>
    <div><button type="button" disabled={disabled || page === 0} onClick={() => onPageChange(page - 1)}>이전</button><span>{page + 1} / {pages}</span><button type="button" disabled={disabled || page + 1 >= pages} onClick={() => onPageChange(page + 1)}>다음</button></div>
  </nav>;
}
