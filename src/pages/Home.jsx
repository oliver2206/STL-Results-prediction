import { Link } from 'react-router-dom';
import PriceBoard from '../components/PriceBoard';
import RoomCard from '../components/RoomCard';
import { rooms, amenities } from '../data/rooms';
import './Home.css';

const testimonials = [
  {
    quote: 'Checked in at 1am after the bus got delayed and the guy at the desk still had breakfast written down for me the next morning. Small thing, but it mattered.',
    name: 'Rina, Manila',
  },
  {
    quote: 'Cheapest twin room I found in Baguio that still had hot water every time, not just in the morning.',
    name: 'Marco, Cebu',
  },
  {
    quote: 'Booked the family room for four of us. Cheaper than splitting two hotel rooms and the breakfast alone was worth it.',
    name: 'The Ramos family',
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">Session Road, Baguio City</span>
            <h1>Tuloy po kayo.<br />Come in, the room's ready.</h1>
            <p className="hero-lead">
              A small inn near the market with clean rooms, hot showers, and rates we write on the
              wall instead of hiding in fine print. From &#8369;450 a night.
            </p>
            <div className="hero-actions">
              <Link to="/booking" className="btn btn-primary">Check rates &amp; book</Link>
              <Link to="/rooms" className="btn btn-ghost on-light">See all rooms</Link>
            </div>
            <div className="hero-trust">
              <div><strong>4.7</strong><span>guest rating</span></div>
              <div><strong>800+</strong><span>stays a year</span></div>
              <div><strong>7 min</strong><span>walk to the market</span></div>
            </div>
          </div>
          <div className="hero-board">
            <PriceBoard />
          </div>
        </div>
        <div className="banig" />
      </section>

      <section className="section section-tight">
        <div className="wrap">
          <div className="promise-grid">
            <div className="promise-item">
              <span className="promise-num">01</span>
              <h3>The price on the wall is the price you pay</h3>
              <p>No booking fee, no "resort fee," no surprise charge at checkout. What's on the board is what's on your bill.</p>
            </div>
            <div className="promise-item">
              <span className="promise-num">02</span>
              <h3>Breakfast is never an add-on</h3>
              <p>Every room, every night, comes with a real home-cooked breakfast &mdash; already counted into the rate.</p>
            </div>
            <div className="promise-item">
              <span className="promise-num">03</span>
              <h3>Someone's always at the desk</h3>
              <p>Late bus, early flight, doesn't matter. Check-in doesn't have a curfew here.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section rooms-preview">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">Rooms &amp; rates</span>
              <h2>Pick what fits your trip</h2>
            </div>
            <Link to="/rooms" className="section-head-link">Compare all rooms &rarr;</Link>
          </div>
          <div className="rooms-grid">
            {rooms.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </div>
      </section>

      <section className="section amenities-section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <span className="eyebrow">What's included</span>
              <h2>Small inn, real comforts</h2>
            </div>
          </div>
          <div className="amenities-grid">
            {amenities.map((a) => (
              <div className="amenity-card" key={a.title}>
                <h3>{a.title}</h3>
                <p>{a.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight testimonials">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Guests say</span>
            <h2>Straightforward, mostly</h2>
          </div>
          <div className="testimonial-row">
            {testimonials.map((t) => (
              <blockquote className="testimonial-card" key={t.name}>
                <p>&ldquo;{t.quote}&rdquo;</p>
                <cite>&mdash; {t.name}</cite>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-banner">
        <div className="wrap cta-banner-inner">
          <div>
            <h2>Got a date in mind?</h2>
            <p>Check what's open and lock in your rate in under two minutes.</p>
          </div>
          <Link to="/booking" className="btn btn-primary">Check rates &amp; book</Link>
        </div>
      </section>
    </>
  );
}
