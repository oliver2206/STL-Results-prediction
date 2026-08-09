import { rooms } from '../data/rooms';
import './PriceBoard.css';

export default function PriceBoard({ title = 'Tonight\u2019s rates', compact = false }) {
  return (
    <div className={`price-board ${compact ? 'is-compact' : ''}`}>
      <div className="price-board-head">
        <span className="price-board-title">{title}</span>
        <span className="price-board-note">per room, per night</span>
      </div>
      <ul className="price-board-list">
        {rooms.map((r, i) => (
          <li key={r.id} className="price-board-row">
            <span className="price-board-num">{String(i + 1).padStart(2, '0')}</span>
            <span className="price-board-name">{r.name}</span>
            <span className="price-board-dots" aria-hidden="true" />
            <span className="price-board-price">&#8369;{r.price.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      <div className="price-board-foot">No hidden fees. No surprise checkout math.</div>
    </div>
  );
}
