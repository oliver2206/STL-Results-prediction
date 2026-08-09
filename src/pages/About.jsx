import { Link } from 'react-router-dom';
import './About.css';

const values = [
  {
    title: 'We skip what you don\u2019t need',
    detail: 'No lobby chandelier, no in-room minibar markup. That budget goes into better mattresses and hot water that actually stays hot.',
  },
  {
    title: 'We cook, we don\u2019t cater',
    detail: 'Breakfast comes from our own kitchen, not a franchised supplier. Cheaper for us, better for you.',
  },
  {
    title: 'We stay small on purpose',
    detail: '18 rooms means the person at the desk actually knows which room has the noisy pipe.',
  },
  {
    title: 'We tell you the real price upfront',
    detail: 'The rate you see when you\u2019re scrolling is the rate on your final bill. Always.',
  },
];

export default function About() {
  return (
    <>
      <section className="about-hero">
        <div className="wrap">
          <span className="eyebrow">Our story</span>
          <h1>A budget inn run like someone's actual house</h1>
          <p>
            Tuloy Inn opened in 2016 in a converted family home two streets off Session Road.
            The idea was simple: Baguio needed a place for travelers who wanted a clean, safe
            room without paying for a pool they'd never use.
          </p>
        </div>
      </section>

      <section className="section about-story">
        <div className="wrap about-story-grid">
          <div className="about-story-text">
            <h2>Why "Tuloy"?</h2>
            <p>
              In Filipino, <em>"tuloy po kayo"</em> is what you say when you open the door for a
              guest &mdash; come in, you're welcome here. That's the whole business plan. We wanted
              a name that promised a welcome, not a rating.
            </p>
            <p>
              Ate Baby, who ran the household before it became an inn, still does the breakfast
              menu every week. Her son Paolo manages bookings and the night desk rotation. Most of
              the staff live within walking distance and have been here since year one.
            </p>
            <Link to="/contact" className="btn btn-primary">Say hello</Link>
          </div>
          <div className="about-story-facts">
            <div className="fact-block">
              <strong>2016</strong>
              <span>Opened, 6 rooms</span>
            </div>
            <div className="fact-block">
              <strong>18</strong>
              <span>rooms today</span>
            </div>
            <div className="fact-block">
              <strong>9</strong>
              <span>staff, mostly neighbors</span>
            </div>
            <div className="fact-block">
              <strong>&#8369;450</strong>
              <span>our cheapest bed, still</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section-tight values-section">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">How we keep it affordable</span>
            <h2>Cheaper without cutting the important stuff</h2>
          </div>
          <div className="values-grid">
            {values.map((v) => (
              <div className="value-card" key={v.title}>
                <h3>{v.title}</h3>
                <p>{v.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section neighborhood">
        <div className="wrap neighborhood-grid">
          <div>
            <span className="eyebrow">The neighborhood</span>
            <h2>What's actually around you</h2>
            <p>
              Seven minutes on foot to the public market for the cheapest strawberries in the
              city. Ten minutes to Burnham Park. Fifteen to the bus terminal if you're heading
              back down. Session Road's restaurants and night market are a straight walk downhill
              &mdash; just remember it's uphill on the way back.
            </p>
          </div>
          <ul className="neighborhood-list">
            <li><strong>Baguio Public Market</strong><span>7 min walk</span></li>
            <li><strong>Burnham Park</strong><span>10 min walk</span></li>
            <li><strong>Session Road</strong><span>8 min walk</span></li>
            <li><strong>Victory Liner Terminal</strong><span>15 min tricycle</span></li>
            <li><strong>Camp John Hay</strong><span>20 min tricycle</span></li>
          </ul>
        </div>
      </section>
    </>
  );
}
