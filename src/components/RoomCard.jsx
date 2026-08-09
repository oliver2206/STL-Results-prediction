import { Link } from 'react-router-dom';
import './RoomCard.css';

export default function RoomCard({ room }) {
  return (
    <article className={`room-card accent-${room.color}`}>
      {room.popular && <span className="room-card-badge">Most booked</span>}
      <div className="room-card-top">
        <h3>{room.name}</h3>
        <p className="room-card-tagline">{room.tagline}</p>
      </div>

      <div className="room-card-price">
        <span className="peso">&#8369;</span>
        <span className="amount">{room.price.toLocaleString()}</span>
        <span className="per">/ night</span>
      </div>

      <dl className="room-card-facts">
        <div>
          <dt>Sleeps</dt>
          <dd>{room.sleeps}</dd>
        </div>
        <div>
          <dt>Bed</dt>
          <dd>{room.bed}</dd>
        </div>
        <div>
          <dt>Bath</dt>
          <dd>{room.bath}</dd>
        </div>
      </dl>

      <ul className="room-card-perks">
        {room.perks.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <Link to={`/booking?room=${room.id}`} className="btn btn-primary room-card-cta">
        Book this room
      </Link>
    </article>
  );
}
