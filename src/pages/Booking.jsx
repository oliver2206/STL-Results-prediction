import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rooms } from '../data/rooms';
import './Booking.css';

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export default function Booking() {
  const [params] = useSearchParams();
  const preselected = params.get('room');
  const initialRoom = rooms.find((r) => r.id === preselected)?.id || rooms[0].id;

  const [form, setForm] = useState({
    roomId: initialRoom,
    checkIn: '',
    checkOut: '',
    guests: 1,
    name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [submitted, setSubmitted] = useState(null);

  const room = rooms.find((r) => r.id === form.roomId) || rooms[0];
  const nights = useMemo(() => nightsBetween(form.checkIn, form.checkOut), [form.checkIn, form.checkOut]);
  const total = nights * room.price;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitted({ ...form, room, nights, total });
  }

  if (submitted) {
    return (
      <section className="section booking-confirm">
        <div className="wrap confirm-card">
          <span className="eyebrow">Request received</span>
          <h1>Tuloy po kayo, {submitted.name.split(' ')[0] || 'there'}.</h1>
          <p>
            We've noted your request for the <strong>{submitted.room.name}</strong>
            {submitted.nights > 0 ? ` for ${submitted.nights} night${submitted.nights > 1 ? 's' : ''}` : ''}.
            A confirmation will be sent to <strong>{submitted.email || 'your email'}</strong> once we verify the dates.
          </p>
          <div className="confirm-summary">
            <div>
              <span>Room</span>
              <strong>{submitted.room.name}</strong>
            </div>
            <div>
              <span>Check-in</span>
              <strong>{submitted.checkIn || '\u2014'}</strong>
            </div>
            <div>
              <span>Check-out</span>
              <strong>{submitted.checkOut || '\u2014'}</strong>
            </div>
            <div>
              <span>Guests</span>
              <strong>{submitted.guests}</strong>
            </div>
            <div className="confirm-total">
              <span>Estimated total</span>
              <strong>&#8369;{submitted.total.toLocaleString()}</strong>
            </div>
          </div>
          <p className="confirm-note">
            This is a request, not a locked reservation. We'll text or email you at{' '}
            {submitted.phone || 'the number you provided'} to confirm availability.
          </p>
          <button className="btn btn-primary" onClick={() => setSubmitted(null)}>
            Make another request
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="section booking-page">
      <div className="wrap booking-grid">
        <form className="booking-form" onSubmit={handleSubmit}>
          <span className="eyebrow">Check rates &amp; book</span>
          <h1>Tell us your dates</h1>

          <label className="field">
            <span>Room type</span>
            <select value={form.roomId} onChange={(e) => update('roomId', e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} &mdash; &#8369;{r.price.toLocaleString()}/night
                </option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Check-in</span>
              <input
                type="date"
                required
                value={form.checkIn}
                onChange={(e) => update('checkIn', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Check-out</span>
              <input
                type="date"
                required
                value={form.checkOut}
                onChange={(e) => update('checkOut', e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Guests</span>
            <input
              type="number"
              min="1"
              max={room.sleeps + 1}
              value={form.guests}
              onChange={(e) => update('guests', Number(e.target.value))}
            />
          </label>

          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              required
              placeholder="Juan Dela Cruz"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                placeholder="you@email.com"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                type="tel"
                placeholder="0917 000 0000"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Anything we should know? (optional)</span>
            <textarea
              rows="3"
              placeholder="Arriving late, need a fan, celebrating a birthday..."
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </label>

          <button type="submit" className="btn btn-primary booking-submit">
            Request this room
          </button>
          <p className="booking-disclaimer">
            This sends a booking request. We confirm real availability by email or text within a few hours.
          </p>
        </form>

        <aside className="booking-summary">
          <div className="summary-card">
            <span className="eyebrow">Your stay</span>
            <h3>{room.name}</h3>
            <p className="summary-tagline">{room.tagline}</p>
            <div className="summary-line">
              <span>Rate</span>
              <strong>&#8369;{room.price.toLocaleString()} / night</strong>
            </div>
            <div className="summary-line">
              <span>Nights</span>
              <strong>{nights || '\u2014'}</strong>
            </div>
            <div className="summary-line total">
              <span>Estimated total</span>
              <strong>&#8369;{total.toLocaleString()}</strong>
            </div>
            <ul className="summary-perks">
              {room.perks.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
