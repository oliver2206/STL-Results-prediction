import RoomCard from '../components/RoomCard';
import { rooms } from '../data/rooms';
import './Rooms.css';

const faqs = [
  {
    q: 'Is breakfast really included in every rate?',
    a: 'Yes, in all four room types. It\u2019s built into the price on the board, not billed separately.',
  },
  {
    q: 'Do you charge extra for a late check-in?',
    a: 'No. Reception is staffed 24 hours, so a 2am arrival costs the same as a 2pm one.',
  },
  {
    q: 'Can I add an extra person to a Twin or Solo room?',
    a: 'One extra mattress on the floor is \u20b1200 a night, subject to space. Ask at booking or at the desk.',
  },
  {
    q: 'What\u2019s your cancellation policy?',
    a: 'Free cancellation up to 24 hours before check-in. After that, the first night is charged.',
  },
];

export default function Rooms() {
  return (
    <>
      <section className="rooms-hero">
        <div className="wrap">
          <span className="eyebrow">Rooms &amp; rates</span>
          <h1>Four room types. One honest rate each.</h1>
          <p>
            Every rate below already includes breakfast, wifi, and tax. Compare beds, bathrooms,
            and what's included, then book straight from the card.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="rooms-grid-full">
            {rooms.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight faq-section">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Before you book</span>
            <h2>Common questions</h2>
          </div>
          <div className="faq-grid">
            {faqs.map((f) => (
              <div className="faq-item" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
